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
    void confirmedNotice(int bookingId, int bookedRiders = 0);
    Json lockTrip(int tripId);
    Json lockRideTrip(int destination, const Json& date, const Json& slot, bool allowMissing = false);
    Json nearbyStations(int stationId, double radius);
    Json rideOptions(const Json& booking);
    int rideDemand(int destination, const Json& date, const Json& slot, int excluding = 0, bool confirmedOnly = false);
    void ensureNoActiveRide(int destination, const Json& date, const Json& slot, int excluding = 0);
    void expireChoices(const Json& userId);
    bool expireChoice(const Json& lockedBooking);
    Json availableOriginalTrip(const Json& booking, int tripId = 0);
    Result originalRequestStatus(const Json& booking);
    Result keepOriginalRide(int destination, const std::string& requested, const std::string& priority, int bookingId = 0, const Json& whatsappRecipient = nullptr);
    Result confirmOriginalRide(int id, const Json& booking);
    Result requestRide(const Json& body);
    Result resolveRide(int id, const Json& body);
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
    void reviewPendingRequests();
    Result handle(const std::string& method,const std::string& path,const Json& query,const Json& body,const std::string& authorization);
};
int runWeb(int argc,char** argv);
}
