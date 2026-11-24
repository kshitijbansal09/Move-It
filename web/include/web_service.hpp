#pragma once
#include "sql_store.hpp"
namespace web {
struct Result {
    Json data;
    int status;
    std::string message;
    Result(Json payload, int code=200, std::string notice="")
        : data(std::move(payload)), status(code), message(std::move(notice)) {}
};
class Service {
    Sql& sql; const Config& config; Json user=nullptr;
    Json profile(int id);
    void admin();
    Json slots();
    Json trips(const Json& filters = Json::object());
    Json bookingRows(const Json& filters, bool own);
    Json booking(int id);
    void ownBooking(const Json& booking);
    void notice(int userId,int bookingId,const std::string& type,const std::string& message);
    void confirmedNotice(int bookingId);
    Json insertBooking(int userId,int tripId,const std::string& priority,const Json& metadata = Json::object());
    Json slotSummary(const std::string& date);
    Json fleet(const std::string& date);
    Json drivers(const std::string& date);
    Result auth(const std::string& action,const Json& body);
    Result entity(const std::string& method,const std::string& name,int id,const Json& body);
    Result trip(const std::string& method,int id,const std::string& action,const Json& query,const Json& body);
    Result bookings(const std::string& method,int id,const std::string& action,const Json& query,const Json& body);
    Result adminView(const std::string& path,const Json& query);
public:
    Service(Sql& connection,const Config& settings) : sql(connection),config(settings) {}
    Result handle(const std::string& method,const std::string& path,const Json& query,const Json& body,const std::string& authorization);
};
int runWeb(int argc,char** argv);
}
