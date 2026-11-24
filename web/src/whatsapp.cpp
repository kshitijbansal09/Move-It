#include "whatsapp.hpp"
#include "httplib.h"
#include <iostream>
#include <regex>

namespace web {
namespace {
struct Submission {
    std::string status;
    Json sid = nullptr;
};

Submission submit(const Config& config, const Json& message) {
    if (config.whatsappSimulate) return {"simulated"};
    httplib::SSLClient client("api.twilio.com");
    client.enable_server_certificate_verification(true);
    client.enable_server_hostname_verification(true);
    client.set_connection_timeout(3);
    client.set_read_timeout(4);
    client.set_write_timeout(3);
    client.set_basic_auth(config.twilioAccountSid,config.twilioAuthToken);
    httplib::Params form={
        {"From",config.twilioWhatsappFrom},
        {"To","whatsapp:"+field(message,"recipient")},
    };
    if (!config.twilioWhatsappRideContentSid.empty()) {
        static const std::regex whitespace(R"(\s+)");
        const auto update = std::regex_replace(field(message,"message"),whitespace," ");
        const Json variables = {{"1",field(message,"booking_id")},{"2",update}};
        form.emplace("ContentSid",config.twilioWhatsappRideContentSid);
        form.emplace("ContentVariables",variables.dump());
    } else if (!config.twilioWhatsappContentSid.empty()) {
        form.emplace("ContentSid",config.twilioWhatsappContentSid);
    } else {
        form.emplace("Body","Move It booking #"+field(message,"booking_id")+": "+field(message,"message"));
    }
    const auto response=client.Post("/2010-04-01/Accounts/"+config.twilioAccountSid+"/Messages.json",form);
    // An ambiguous failure may already have reached Twilio. Never replay it automatically.
    if (!response) {
        std::cerr<<"[WhatsApp] Notification "<<field(message,"notification_id")
                 <<": "<<httplib::to_string(response.error())
                 <<" (TLS "<<response.ssl_error()<<", backend "<<response.ssl_backend_error()<<").\n";
        return {"unknown"};
    }
    const auto payload=Json::parse(response->body,nullptr,false);
    if (response->status<200 || response->status>=300) {
        std::cerr<<"[WhatsApp] Notification "<<field(message,"notification_id")
                 <<": Twilio HTTP "<<response->status;
        if (payload.is_object() && payload.contains("code") && payload["code"].is_number_integer())
            std::cerr<<", code "<<payload["code"];
        std::cerr<<".\n";
        return {response->status>=500?"unknown":"failed"};
    }
    if (!payload.is_object() || !payload.contains("sid") || !payload["sid"].is_string()) {
        std::cerr<<"[WhatsApp] Notification "<<field(message,"notification_id")<<": Twilio returned no message ID.\n";
        return {"unknown"};
    }
    const auto status=field(payload,"status");
    return {status=="failed" || status=="undelivered"?"failed":"submitted",payload["sid"]};
}
} // namespace

void deliverNextWhatsapp(Sql& sql,const Config& config) {
    if (!config.whatsappEnabled) return;
    sql.query("UPDATE NOTIFICATION_LOG SET status='unknown' WHERE channel='whatsapp'"
              " AND status='sending' AND sent_at<DATE_SUB(NOW(),INTERVAL 1 MINUTE)");
    const auto queued=sql.query(
        "SELECT n.notification_id,n.booking_id,n.message,"
        " CASE WHEN b.whatsapp_recipient=u.contact_info THEN b.whatsapp_recipient END AS recipient"
        " FROM NOTIFICATION_LOG n LEFT JOIN BOOKING b ON b.booking_id=n.booking_id"
        " JOIN USER u ON u.user_id=n.user_id WHERE n.channel='whatsapp' AND n.status='pending'"
        " ORDER BY n.notification_id LIMIT 1");
    if (queued.empty()) return;
    const auto& message=queued[0];
    const auto& id=message["notification_id"];
    sql.query("UPDATE NOTIFICATION_LOG SET status='sending',sent_at=NOW()"
              " WHERE notification_id=? AND status='pending'",{id});
    if (sql.affected()!=1) return;
    const auto recipient=field(message,"recipient");
    const auto result=validWhatsappNumber(recipient)?submit(config,message):Submission{"skipped"};
    sql.query("UPDATE NOTIFICATION_LOG SET status=?,twilio_sid=?,sent_at=NOW()"
              " WHERE notification_id=? AND status='sending'",{result.status,result.sid,id});
}
} // namespace web
