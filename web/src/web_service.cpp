#include "web_service.hpp"
#include "geo.hpp"
#include "booking_service.hpp"
#include "scheduling.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <set>
#include <sstream>
namespace web {
static constexpr int CAMPUS_STATION_ID = 1;
static const std::string NO_SCHEDULE = "No bus is scheduled for this destination at that time.";
static const std::string TRIP_FULL = "Trip is fully booked. Choose another option.";
static const std::string CHOICE_EXPIRED = "Your request expired. Please request again.";
static const std::string CHOICE_DUE =
    "(b.original_review_at IS NULL AND (b.expires_at <= NOW() OR t.departure_time <= NOW() OR t.status <> 'scheduled'))";
static constexpr int ORIGINAL_MATCH_MINUTES = 30;
static const std::string LIVE_CHOICE =
    "(b.status='awaiting_choice' AND b.expires_at>NOW()"
    " AND (t.trip_id IS NULL OR (t.departure_time>NOW() AND t.status='scheduled')))";
static const std::string ROUTES = R"(SELECT r.*, s.name AS start_station_name,s.latitude AS start_lat,s.longitude AS start_lon,
 e.name AS end_station_name,e.latitude AS end_lat,e.longitude AS end_lon FROM ROUTE r
 JOIN STATION s ON s.station_id=r.start_station_id JOIN STATION e ON e.station_id=r.end_station_id)";
static const std::string TRIPS = R"(SELECT t.*,ds.label AS slot_label,v.reg_number,v.reg_number AS vehicle_reg,v.capacity,v.capacity AS vehicle_capacity,
 d.name AS driver_name,d.contact_info AS driver_contact,r.route_name,r.start_station_id,r.end_station_id,
 s.name AS start_station_name,e.name AS end_station_name FROM TRIP t
 LEFT JOIN DEPARTURE_SLOT ds ON ds.slot_id=t.slot_id JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id
 JOIN DRIVER d ON d.driver_id=t.driver_id JOIN ROUTE r ON r.route_id=t.route_id
 JOIN STATION s ON s.station_id=r.start_station_id JOIN STATION e ON e.station_id=r.end_station_id)";
static const std::string BOOKINGS = R"(SELECT b.*,u.name AS user_name,u.email AS user_email,u.role AS user_role,u.contact_info AS user_contact,
 t.departure_time,COALESCE(t.trip_date,b.requested_trip_date) AS trip_date,t.status AS trip_status,t.seats_filled,ds.label AS slot_label,
 v.reg_number AS vehicle_reg,v.capacity AS vehicle_capacity,d.name AS driver_name,d.contact_info AS driver_contact,
 r.route_name,r.start_station_id,r.end_station_id,s.name AS start_station_name,e.name AS end_station_name,
 COALESCE(dest.name,e.name) AS destination FROM BOOKING b JOIN USER u ON u.user_id=b.user_id
 LEFT JOIN TRIP t ON t.trip_id=b.trip_id LEFT JOIN DEPARTURE_SLOT ds ON ds.slot_id=COALESCE(t.slot_id,b.slot_id)
 LEFT JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id LEFT JOIN DRIVER d ON d.driver_id=t.driver_id
 LEFT JOIN ROUTE r ON r.route_id=t.route_id LEFT JOIN STATION s ON s.station_id=r.start_station_id
 LEFT JOIN STATION e ON e.station_id=r.end_station_id LEFT JOIN STATION dest ON dest.station_id=b.destination_station_id)";
static void require(bool condition,const std::string& message,int status=400) { if(!condition)throw Error(status,message); }
static void choice(const std::string& value,const std::vector<std::string>& allowed,const std::string& label) {
    require(std::find(allowed.begin(),allowed.end(),value)!=allowed.end(),"Choose a valid "+label+".");
}
static std::string trimmed(std::string value) { auto begin=value.find_first_not_of(" \t\r\n");if(begin==std::string::npos)return "";return value.substr(begin,value.find_last_not_of(" \t\r\n")-begin+1); }
static std::string lowerCase(std::string value) { for(auto& c:value)c=static_cast<char>(std::tolower(static_cast<unsigned char>(c)));return value; }
Json Service::profile(int id) {
    auto rows=sql.query("SELECT u.user_id,u.name,u.email,u.role,u.station_id,u.contact_info,s.name AS station_name FROM USER u LEFT JOIN STATION s ON s.station_id=u.station_id WHERE u.user_id=?",{id});
    require(!rows.empty(),"Your account is unavailable. Please sign in again.",401);
    auto account=rows[0];
    const bool validContact=validWhatsappNumber(field(account,"contact_info"));
    account["whatsapp_available"]=config.whatsappEnabled && validContact;
    if (!config.whatsappEnabled) account["whatsapp_unavailable_reason"]="WhatsApp updates are unavailable on this server.";
    else if (!validContact) account["whatsapp_unavailable_reason"]="Ask an administrator to update your account phone number with its country code.";
    return account;
}
void Service::admin(){require(field(user,"role")=="admin","This action is available to administrators only.",403);}
Json Service::slots(){return sql.query("SELECT * FROM DEPARTURE_SLOT ORDER BY departure_time");}
Json Service::trips(const Json& filters) {
    std::string where=" WHERE 1=1";std::vector<Json> parameters;
    if(!field(filters,"date").empty()){where+=" AND t.trip_date=?";parameters.push_back(validateDate(field(filters,"date")));}
    if(!field(filters,"status").empty()){choice(field(filters,"status"),{"scheduled","departed","completed"},"trip status");where+=" AND t.status=?";parameters.push_back(filters["status"]);}
    if(!field(filters,"route_id").empty()){where+=" AND t.route_id=?";parameters.push_back(integer(filters,"route_id"));}
    if(!field(filters,"trip_id").empty()){where+=" AND t.trip_id=?";parameters.push_back(integer(filters,"trip_id"));}
    auto rows=sql.query(TRIPS+where+" ORDER BY t.departure_time,t.trip_id",parameters);
    for(auto& row:rows)row["departure_time"]=offsetTime(field(row,"departure_time"));return rows;
}
static Json enrich(Json row) {
    row.erase("active_trip_id");
    row["whatsapp_updates"]=!row["whatsapp_recipient"].is_null();
    row.erase("whatsapp_recipient");
    const bool confirmed = field(row,"status") == "confirmed";
    const auto departure = confirmed ? field(row,"departure_time") : "";
    row["bookingId"] = row["booking_id"];
    if (!row["expires_at"].is_null()) row["expires_at"] = offsetTime(field(row,"expires_at"));
    if (!row["original_review_at"].is_null()) {
        row["original_review_at"] = offsetTime(field(row,"original_review_at"));
        row["preferred_departure"] = offsetTime(field(row,"requested_time"));
    }
    if(departure.empty()){row["minutes_remaining"]=nullptr;row["trip_details"]=nullptr;row["departure_time"]=nullptr;}
    else {
        row["minutes_remaining"]=std::max(0LL,static_cast<long long>(std::ceil(std::difftime(campusTimestamp(departure),std::time(nullptr))/60)));
        row["departure_time"]=offsetTime(departure);
        row["trip_details"]={{"tripId",row["trip_id"]},{"routeName",row["route_name"]},{"vehicleReg",row["vehicle_reg"]},{"vehicleCapacity",row["vehicle_capacity"]},{"driverName",row["driver_name"]},{"driverContact",row["driver_contact"]},{"departureTime",row["departure_time"]},{"slotLabel",row["slot_label"]}};
    }
    row["bus"]=!confirmed || field(row,"vehicle_reg").empty()?Json(nullptr):Json{{"reg_number",row["vehicle_reg"]},{"capacity",row["vehicle_capacity"]}};
    row["driver"]=!confirmed || field(row,"driver_name").empty()?Json(nullptr):Json{{"name",row["driver_name"]},{"contact_info",row["driver_contact"]}};
    row["route"]=!confirmed || field(row,"route_name").empty()?Json(nullptr):Json{{"name",row["route_name"]},{"start_station",row["start_station_name"]},{"end_station",row["end_station_name"]}};
    row["departure"] = departure.empty() ? Json(nullptr) : Json{
        {"slot_label",row["slot_label"]},{"departure_datetime",row["departure_time"]},
        {"minutes_remaining",row["minutes_remaining"]},{"bus",row["bus"]},{"driver",row["driver"]},
        {"route",row["route"].is_null() ? Json(nullptr) : Json{{"start",row["start_station_name"]},{"end",row["end_station_name"]}}}
    };
    return row;
}
Json Service::bookingRows(const Json& filters,bool own) {
    std::string where=" WHERE 1=1";std::vector<Json> parameters;
    if(own && field(user,"role")!="admin"){where+=" AND b.user_id=?";parameters.push_back(user["user_id"]);}
    if(!field(filters,"date").empty()){where+=" AND COALESCE(t.trip_date,b.requested_trip_date)=?";parameters.push_back(validateDate(field(filters,"date")));}
    for(auto key:{"station_id","slot_id","booking_id"})if(!field(filters,key).empty()) {
        where+=std::string(" AND ")+(std::string(key)=="station_id"?"COALESCE(b.destination_station_id,r.end_station_id)":std::string(key)=="slot_id"?"COALESCE(t.slot_id,b.slot_id)":"b.booking_id")+"=?";parameters.push_back(integer(filters,key));
    }
    if(!field(filters,"status").empty()){choice(field(filters,"status"),{"confirmed","pending","rejected","cancelled","awaiting_choice"},"booking status");where+=" AND b.status=?";parameters.push_back(filters["status"]);}
    auto rows=sql.query(BOOKINGS+where+" ORDER BY b.booking_time DESC,b.booking_id DESC",parameters);
    for(auto& row:rows)row=enrich(row);return rows;
}
Json Service::booking(int id){auto rows=bookingRows(Json{{"booking_id",id}},false);require(!rows.empty(),"Booking not found.",404);return rows[0];}
void Service::ownBooking(const Json& b){require(field(user,"role")=="admin" || b["user_id"]==user["user_id"],"You can only access your own bookings.",403);}
void Service::notice(int userId,int bookingId,const std::string& type,const std::string& message) {
    sql.query("INSERT INTO NOTIFICATION_LOG(user_id,booking_id,channel,type,message,status)"
              " VALUES (?,?,'in_app',?,?,'sent')",{userId,bookingId,type,message});
    if (config.whatsappEnabled) {
        // The notification and outbox entry are committed with the booking change.
        sql.query("INSERT INTO NOTIFICATION_LOG(user_id,booking_id,channel,type,message,status)"
                  " SELECT user_id,booking_id,'whatsapp',?,?,'pending' FROM BOOKING"
                  " WHERE booking_id=? AND user_id=? AND whatsapp_recipient IS NOT NULL",
                  {type,message,bookingId,userId});
    }
}
void Service::confirmedNotice(int id, int bookedRiders) {
    const auto b = booking(id);
    const auto departure = field(b,"slot_label").empty() ? normalizeTime(field(b,"departure_time")).substr(0,16) + " India time" : field(b,"slot_label");
    auto message = "Your ride to " + field(b,"destination") + " is confirmed. Departure " + departure +
        ", bus " + field(b,"vehicle_reg") + ", driver " + field(b,"driver_name") + " (" + field(b,"driver_contact") + ").";
    if (bookedRiders > 0) message += " " + std::to_string(bookedRiders) + " rider(s) booked so far.";
    notice(integer(b,"user_id"),id,"booking_confirmed",message);
}

Json Service::lockTrip(int tripId) {
    // Lock the trip by primary key before the vehicle. All seat writers use this order.
    const auto trips = sql.query("SELECT * FROM TRIP WHERE trip_id=? FOR UPDATE",{tripId});
    require(!trips.empty(),"Trip not found.",404);
    auto trip = trips[0];
    const auto vehicles = sql.query("SELECT capacity,status FROM VEHICLE WHERE vehicle_id=? FOR UPDATE",{trip["vehicle_id"]});
    require(!vehicles.empty(),"Bus not found.",404);
    trip["capacity"] = vehicles[0]["capacity"];
    trip["vehicle_status"] = vehicles[0]["status"];
    return trip;
}

Json Service::insertBooking(int userId,int tripId,const std::string& priority,const Json& metadata) {
    choice(priority,{"normal","urgent"},"priority");
    const auto trip = lockTrip(tripId);
    require(field(trip,"status")=="scheduled","This trip is no longer scheduled.");
    require(field(trip,"vehicle_status")=="active","This bus is in maintenance or inactive",409);
    const auto route = sql.query("SELECT end_station_id FROM ROUTE WHERE route_id=?",{trip["route_id"]})[0];
    sql.query("INSERT INTO BOOKING(user_id,trip_id,priority,status,destination_station_id,requested_time,slot_id) VALUES (?,?,?,'confirmed',?,?,?)",{userId,tripId,priority,metadata.value("destination_station_id",route["end_station_id"]),metadata.value("requested_time",trip["departure_time"]),trip["slot_id"]});
    int id=static_cast<int>(sql.insertId());confirmedNotice(id);return booking(id);
}
Result Service::auth(const std::string& action,const Json& body) {
    std::string email=lowerCase(trimmed(field(body,"email"))),password=field(body,"password");
    require(!email.empty() && email.size()<=255 && !password.empty() && password.size()<=128,"Enter your email and password.");
    if(action=="login") {
        auto rows=sql.query("SELECT user_id,password_hash FROM USER WHERE email=?",{email});
        require(!rows.empty() && passwordMatches(password,field(rows[0],"password_hash")),"Invalid email or password.",401);
        auto u=profile(integer(rows[0],"user_id"));return {Json{{"user",u},{"token",issueToken(u,config.jwtSecret)}},200,"Login successful."};
    }
    require(action=="signup","Endpoint not found.",404);
    auto name=trimmed(field(body,"name")),phone=trimmed(field(body,"contact_info")),role=field(body,"role","student");
    choice(role,{"student","faculty"},"signup role");
    require(!name.empty() && name.size()<=255 && !phone.empty() && phone.size()<=20 && password.size()>=8 && email.find('@')!=std::string::npos,"Enter a name, valid email, phone and password of at least 8 characters.");
    if(phone.front()!='+')phone=(phone.size()==10?"+91":"+")+phone;
    require(phone.size()<=20,"Enter a valid phone number.");
    Json station=integer(body,"station_id")>0?Json(integer(body,"station_id")):Json(nullptr);
    sql.query("INSERT INTO USER(name,email,password_hash,role,station_id,contact_info) VALUES (?,?,?,?,?,?)",{name,email,passwordHash(password),role,station,phone});
    auto u=profile(static_cast<int>(sql.insertId()));return {Json{{"user",u},{"token",issueToken(u,config.jwtSecret)}},201,"Account created."};
}
Result Service::entity(const std::string& method,const std::string& name,int id,const Json& body) {
    const std::map<std::string,std::pair<std::string,std::vector<std::string>>> definitions={
        {"stations",{"STATION",{"name","latitude","longitude"}}},{"vehicles",{"VEHICLE",{"reg_number","capacity","status"}}},
        {"drivers",{"DRIVER",{"name","license_no","contact_info"}}},{"routes",{"ROUTE",{"route_name","start_station_id","end_station_id"}}}};
    const auto& definition=definitions.at(name);const auto& table=definition.first;auto key=lowerCase(table)+"_id";
    std::string select=name=="routes"?ROUTES:"SELECT * FROM "+table;
    if(method=="GET"){auto rows=sql.query(select+(id?" WHERE "+std::string(name=="routes"?"r.":"")+key+"=?":" ORDER BY "+key),id?std::vector<Json>{id}:std::vector<Json>{});if(id){require(!rows.empty(),"Record not found.",404);return {rows[0]};}return {rows};}
    admin();Json existing=Json::object();
    if(id){auto rows=sql.query("SELECT * FROM "+table+" WHERE "+key+"=?",{id});require(!rows.empty(),"Record not found.",404);existing=rows[0];}
    if(method=="DELETE"){require(id>0,"Choose a record to delete.");sql.query("DELETE FROM "+table+" WHERE "+key+"=?",{id});return {Json{{key,id}},200,"Record deleted."};}
    require(method=="POST" || method=="PUT","Method not allowed.",405);
    Json merged=existing;for(const auto& column:definition.second)if(body.contains(column))merged[column]=body[column];
    if(name=="vehicles" && !merged.contains("status"))merged["status"]="active";
    for(const auto& column:definition.second)require(merged.contains(column) && !field(merged,column).empty(),column+" is required.");
    if(name=="vehicles"){require(integer(merged,"capacity")>0 && integer(merged,"capacity")<=1000,"Capacity must be between 1 and 1000.");choice(field(merged,"status"),{"active","maintenance","inactive"},"vehicle status");}
    if(name=="stations") {
        try{auto lat=std::stod(field(merged,"latitude")),lon=std::stod(field(merged,"longitude"));require(std::isfinite(lat)&&std::isfinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180,"Enter valid station coordinates.");}catch(const Error&){throw;}catch(...){throw Error(400,"Enter valid station coordinates.");}
    }
    if(name=="routes")require(integer(merged,"start_station_id")>0 && integer(merged,"end_station_id")>0 && integer(merged,"start_station_id")!=integer(merged,"end_station_id"),"Choose different origin and destination stations.");
    std::string columns,values;std::vector<Json> parameters;
    for(const auto& column:definition.second){if(!columns.empty()){columns+=",";values+=",";}columns+=column+(id?"=?":"");values+="?";parameters.push_back(merged[column]);}
    if(id){parameters.push_back(id);sql.query("UPDATE "+table+" SET "+columns+" WHERE "+key+"=?",parameters);}
    else {sql.query("INSERT INTO "+table+"("+columns+") VALUES ("+values+")",parameters);id=static_cast<int>(sql.insertId());}
    auto result=entity("GET",name,id,Json::object());result.status=method=="POST"?201:200;result.message="Record saved.";return result;
}
Result Service::trip(const std::string& method,int id,const std::string& action,const Json& query,const Json& body) {
    if(method=="GET"){auto filters=query;if(id)filters["trip_id"]=id;auto rows=trips(filters);if(id){require(!rows.empty(),"Trip not found.",404);return {rows[0]};}return {rows};}
    auto role=field(user,"role");bool isDriver=role=="driver";
    if(isDriver){require(method=="PUT" && action.empty(),"This action is available to administrators only.",403);for(auto it=body.begin();it!=body.end();++it)require(it.key()=="status","Drivers can update trip status only.",403);}else admin();
    if(action=="schedule-batch") {
        require(method=="POST","Method not allowed.",405);auto policy=field(body,"policy","priority");choice(policy,{"priority","fcfs"},"scheduling policy");Transaction transaction(sql);
        auto current=lockTrip(id);require(field(current,"status")=="scheduled","Only scheduled trips can receive seats.");
        auto pending=sql.query("SELECT b.*,u.name AS user_name FROM BOOKING b JOIN USER u ON u.user_id=b.user_id WHERE b.trip_id=? AND b.status='pending' ORDER BY b.booking_time,b.booking_id",{id});
        std::vector<Request> requests;for(const auto& b:pending)requests.push_back({integer(b,"booking_id"),integer(b,"user_id"),field(b,"priority"),campusTimestamp(field(b,"booking_time")),field(b,"user_name")});
        auto allocation=allocateSeats(integer(current,"capacity"),integer(current,"seats_filled"),requests,policy);Json assigned=Json::array(),waitlisted=Json::array();
        for(const auto& request:allocation.assigned){sql.query("UPDATE BOOKING SET status='confirmed' WHERE booking_id=?",{request.bookingId});confirmedNotice(request.bookingId);assigned.push_back(Json{{"booking_id",request.bookingId},{"user_id",request.userId},{"queue_position",request.queuePos},{"allocation_status","assigned"}});}
        for(const auto& request:allocation.waitlisted)waitlisted.push_back(Json{{"booking_id",request.bookingId},{"user_id",request.userId},{"queue_position",request.queuePos},{"allocation_status","waitlisted"}});
        transaction.commit();return {Json{{"policy_applied",policy},{"allocation",{{"tripId",id},{"capacity",allocation.capacity},{"seatsFilled",allocation.seatsFilled},{"availableSeats",allocation.available},{"assigned",assigned},{"waitlisted",waitlisted}}}},200,"Seat scheduling completed."};
    }
    require(action.empty(),"Endpoint not found.",404);Json previous=Json::object();
    Transaction transaction(sql);
    if(id){auto rows=sql.query("SELECT t.*,d.name AS driver_name FROM TRIP t JOIN DRIVER d ON d.driver_id=t.driver_id WHERE trip_id=? FOR UPDATE OF t",{id});require(!rows.empty(),"Trip not found.",404);previous=rows[0];}
    if(isDriver)require(field(previous,"driver_name")==field(user,"name"),"You can only update your own trips.",403);
    if(method=="DELETE"){require(id>0,"Choose a trip.");sql.query("DELETE FROM TRIP WHERE trip_id=?",{id});transaction.commit();return {Json{{"trip_id",id}},200,"Trip deleted."};}
    require(method=="POST" || method=="PUT","Method not allowed.",405);auto merged=previous;
    for(auto key:{"vehicle_id","route_id","driver_id","trip_date","slot_id","status"})if(body.contains(key))merged[key]=body[key];
    if(!merged.contains("status"))merged["status"]="scheduled";
    if(body.contains("departure_time") && !body.contains("trip_date") && !body.contains("slot_id") && (!previous.contains("slot_id") || !previous["slot_id"].is_null())) {
        auto datetime=normalizeTime(field(body,"departure_time"));auto matching=sql.query("SELECT slot_id FROM DEPARTURE_SLOT WHERE departure_time=?",{datetime.substr(11)});require(!matching.empty(),"Choose a fixed departure: 1:00 PM, 4:00 PM or 6:00 PM.");merged["trip_date"]=datetime.substr(0,10);merged["slot_id"]=matching[0]["slot_id"];
    }
    choice(field(merged,"status"),{"scheduled","departed","completed"},"trip status");
    for(auto key:{"vehicle_id","route_id","driver_id"})require(integer(merged,key)>0,std::string(key)+" is required.");
    require(merged.contains("slot_id"),"Choose a departure slot or a custom departure.");
    const auto date=validateDate(field(merged,"trip_date",field(previous,"departure_time").substr(0,10)));
    std::string departure;
    if (merged["slot_id"].is_null()) {
        departure=normalizeTime(field(body,"departure_time",field(previous,"departure_time")));
        require(departure.substr(0,10)==date,"Custom departure must match the selected date.");
    } else {
        require(integer(merged,"slot_id")>0,"Choose a valid departure slot.");
        const auto slot=sql.query("SELECT * FROM DEPARTURE_SLOT WHERE slot_id=?",{merged["slot_id"]});
        require(!slot.empty(),"Choose a valid departure slot.");
        departure=date+" "+field(slot[0],"departure_time");
    }
    auto vehicle=sql.query("SELECT status,capacity FROM VEHICLE WHERE vehicle_id=?",{merged["vehicle_id"]});require(!vehicle.empty(),"Bus not found.");require(field(vehicle[0],"status")=="active","This bus is in maintenance or inactive",409);require(integer(previous,"seats_filled")<=integer(vehicle[0],"capacity"),"The selected bus cannot hold the existing reservations.",409);
    if(id){
        sql.query("UPDATE TRIP SET vehicle_id=?,route_id=?,driver_id=?,trip_date=?,slot_id=?,departure_time=?,status=? WHERE trip_id=?",
                  {merged["vehicle_id"],merged["route_id"],merged["driver_id"],date,merged["slot_id"],departure,merged["status"],id});
        sql.query("UPDATE BOOKING SET slot_id=? WHERE trip_id=?",{merged["slot_id"],id});
        const auto status=field(merged,"status");
        if (status!=field(previous,"status") && (status=="departed" || status=="completed")) {
            const auto riders=sql.query("SELECT booking_id,user_id FROM BOOKING WHERE trip_id=? AND status='confirmed'",{id});
            const auto message=status=="departed"?"Your shuttle has departed.":"Your shuttle trip is complete.";
            for (const auto& rider : riders)
                notice(integer(rider,"user_id"),integer(rider,"booking_id"),"trip_"+status,message);
        }
    }
    else{sql.query("INSERT INTO TRIP(vehicle_id,route_id,driver_id,trip_date,slot_id,departure_time,status) VALUES (?,?,?,?,?,?,?)",{merged["vehicle_id"],merged["route_id"],merged["driver_id"],date,merged["slot_id"],departure,merged["status"]});id=static_cast<int>(sql.insertId());}
    transaction.commit();return {trips(Json{{"trip_id",id}})[0],method=="POST"?201:200,"Trip saved."};
}
Json Service::lockRideTrip(int destination, const Json& date, const Json& slot, bool allowMissing) {
    const std::string criteria =
        " FROM TRIP t JOIN ROUTE r ON r.route_id=t.route_id JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id"
        " WHERE r.start_station_id=? AND r.end_station_id=? AND t.trip_date=? AND t.slot_id=?"
        " AND t.status='scheduled' AND t.departure_time>NOW()";
    const std::vector<Json> values = {CAMPUS_STATION_ID,destination,date,slot};
    const auto anchors = sql.query("SELECT t.trip_id"+criteria+" ORDER BY t.trip_id LIMIT 1",values);
    if (allowMissing && anchors.empty()) return nullptr;
    require(!anchors.empty(),NO_SCHEDULE,422);
    // Use the first trip as the demand lock even if a second bus has spare seats.
    // Every request for this corridor/date/slot counts demand after taking this lock.
    sql.query("SELECT trip_id FROM TRIP WHERE trip_id=? FOR UPDATE",{anchors[0]["trip_id"]});
    const auto candidates = sql.query("SELECT t.trip_id"+criteria+
        " ORDER BY (v.status='active') DESC,(t.seats_filled<v.capacity) DESC,t.trip_id LIMIT 1",values);
    if (allowMissing && candidates.empty()) return nullptr;
    require(!candidates.empty(),NO_SCHEDULE,422);
    auto trip = lockTrip(integer(candidates[0],"trip_id"));
    require(field(trip,"status")=="scheduled" && trip["trip_date"]==date && trip["slot_id"]==slot &&
        campusTimestamp(field(trip,"departure_time"))>std::time(nullptr),NO_SCHEDULE,422);
    if (allowMissing && field(trip,"vehicle_status")!="active") return nullptr;
    require(field(trip,"vehicle_status")=="active","This bus is in maintenance or inactive",409);
    return trip;
}

int Service::rideDemand(int destination, const Json& date, const Json& slot, int excluding, bool confirmedOnly) {
    std::string status = "b.status='confirmed'";
    if (!confirmedOnly) status = "(" + status + " OR " + LIVE_CHOICE + ")";
    const auto rows = sql.query("SELECT COUNT(*) AS n FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
        " LEFT JOIN ROUTE r ON r.route_id=t.route_id WHERE (t.trip_id IS NULL OR r.start_station_id=?)"
        " AND COALESCE(b.destination_station_id,r.end_station_id)=?"
        " AND COALESCE(t.trip_date,b.requested_trip_date)=? AND COALESCE(t.slot_id,b.slot_id)=?"
        " AND b.booking_id<>? AND "+status,{CAMPUS_STATION_ID,destination,date,slot,excluding});
    return integer(rows[0],"n");
}

Json Service::nearbyStations(int station, double radius) {
    const auto origin = sql.query("SELECT latitude,longitude FROM STATION WHERE station_id=?",{station});
    require(!origin.empty(),"Station not found.",404);
    Json nearby = Json::array();
    for (auto row : sql.query("SELECT * FROM STATION WHERE station_id<>?",{station})) {
        const auto distance = distanceKm(origin[0]["latitude"].get<double>(),origin[0]["longitude"].get<double>(),
                                         row["latitude"].get<double>(),row["longitude"].get<double>());
        if (distance <= radius) {
            row["distance_km"] = distance;
            nearby.push_back(row);
        }
    }
    std::sort(nearby.begin(),nearby.end(),[](const Json& a,const Json& b) {
        if (a["distance_km"] != b["distance_km"]) return a["distance_km"] < b["distance_km"];
        return a["station_id"] < b["station_id"];
    });
    return nearby;
}

Json Service::rideOptions(const Json& b) {
    const auto date = b["trip_date"];
    const auto destination = integer(b,"destination_station_id");
    const auto departures = sql.query("SELECT * FROM DEPARTURE_SLOT WHERE TIMESTAMP(?,departure_time)>NOW()"
                                      " ORDER BY departure_time",{date});
    const auto availability = sql.query("SELECT r.end_station_id,t.slot_id,"
        " SUM(GREATEST(0,v.capacity-t.seats_filled)) AS seats FROM TRIP t JOIN ROUTE r ON r.route_id=t.route_id"
        " JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id WHERE r.start_station_id=? AND t.trip_date=?"
        " AND t.status='scheduled' AND v.status='active' AND t.departure_time>NOW()"
        " GROUP BY r.end_station_id,t.slot_id",{CAMPUS_STATION_ID,date});
    const auto demand = sql.query("SELECT COALESCE(b.destination_station_id,r.end_station_id) AS end_station_id,"
        " COALESCE(t.slot_id,b.slot_id) AS slot_id,COUNT(*) AS n FROM BOOKING b"
        " LEFT JOIN TRIP t ON t.trip_id=b.trip_id LEFT JOIN ROUTE r ON r.route_id=t.route_id"
        " WHERE COALESCE(t.trip_date,b.requested_trip_date)=? AND (t.trip_id IS NULL OR r.start_station_id=?)"
        " AND (b.status='confirmed' OR "+LIVE_CHOICE+")"
        " GROUP BY COALESCE(b.destination_station_id,r.end_station_id),COALESCE(t.slot_id,b.slot_id)",{date,CAMPUS_STATION_ID});
    const auto makeOption = [&](int station, const Json& slot) {
        const auto allocation = std::find_if(availability.begin(),availability.end(),[&](const Json& row) {
            return row["end_station_id"]==station && row["slot_id"]==slot["slot_id"];
        });
        const auto requests = std::find_if(demand.begin(),demand.end(),[&](const Json& row) {
            return row["end_station_id"]==station && row["slot_id"]==slot["slot_id"];
        });
        const auto count = requests==demand.end()?0:integer(*requests,"n");
        return Json{{"slot_id",slot["slot_id"]},{"slot_label",slot["label"]},
            {"request_count",count},{"seats_available",allocation==availability.end()?0:integer(*allocation,"seats")},
            {"scheduled",allocation!=availability.end()},{"high_demand",count>=config.highDemandThreshold}};
    };
    Json same = Json::array(), nearby = Json::array();
    for (const auto& slot : departures) same.push_back(makeOption(destination,slot));
    for (const auto& station : nearbyStations(destination,NEARBY_RADIUS_KM)) {
        for (const auto& slot : departures) {
            auto option = makeOption(integer(station,"station_id"),slot);
            if (!integer(option,"seats_available")) continue;
            option["destination_station_id"] = station["station_id"];
            option["station"] = station["name"];
            option["distance_km"] = station["distance_km"];
            nearby.push_back(option);
        }
    }
    std::sort(nearby.begin(),nearby.end(),[](const Json& a,const Json& b) {
        if (a["distance_km"]!=b["distance_km"]) return a["distance_km"]<b["distance_km"];
        if (a["slot_id"]!=b["slot_id"]) return a["slot_id"]<b["slot_id"];
        return a["destination_station_id"]<b["destination_station_id"];
    });
    if (nearby.size()>5) nearby.erase(nearby.begin()+5,nearby.end());
    const auto stations = sql.query("SELECT station_id,name FROM STATION ORDER BY name");
    Json fixed = Json::array();
    for (const auto& slot : departures) for (const auto& station : stations) {
        const auto id = integer(station,"station_id");
        if (id==destination) continue;
        const bool alreadyShown = std::any_of(nearby.begin(),nearby.end(),[&](const Json& option) {
            return option["destination_station_id"]==id && option["slot_id"]==slot["slot_id"];
        });
        if (alreadyShown) continue;
        auto option = makeOption(id,slot);
        if (integer(option,"seats_available")==0) continue;
        option["destination_station_id"] = id;
        option["station"] = station["name"];
        fixed.push_back(option);
    }
    return Json{{"slots",same},{"nearby",nearby},{"fixed",fixed}};
}

bool Service::expireChoice(const Json& b) {
    if (field(b,"status")!="awaiting_choice" || !integer(b,"due")) return false;
    sql.query("UPDATE BOOKING SET status='cancelled' WHERE booking_id=? AND status='awaiting_choice' AND trip_id <=> ?",
              {b["booking_id"],b["trip_id"]});
    if (sql.affected()==0) return false;
    notice(integer(b,"user_id"),integer(b,"booking_id"),"booking_expired",CHOICE_EXPIRED);
    return true;
}

void Service::expireChoices(const Json& userId) {
    const std::string owner = userId.is_null() ? "" : " AND b.user_id=?";
    const auto candidates = sql.query(
        "SELECT b.booking_id FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
        " WHERE b.status='awaiting_choice' AND "+CHOICE_DUE+owner+" ORDER BY b.booking_id",
        userId.is_null()?std::vector<Json>{}:std::vector<Json>{userId});
    for (const auto& candidate : candidates) {
        Transaction transaction(sql);
        const auto rows = sql.query("SELECT booking_id,trip_id,user_id,status FROM BOOKING WHERE booking_id=? FOR UPDATE",
                                    {candidate["booking_id"]});
        if (!rows.empty() && field(rows[0],"status")=="awaiting_choice") {
            auto b = rows[0];
            b["due"] = sql.query("SELECT "+CHOICE_DUE+" AS due FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
                                 " WHERE b.booking_id=?",{b["booking_id"]})[0]["due"];
            expireChoice(b);
        }
        transaction.commit();
    }
}

void Service::ensureNoActiveRide(int destination, const Json& date, const Json& slot, int excluding) {
    const auto duplicate = sql.query("SELECT b.booking_id FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
        " LEFT JOIN ROUTE r ON r.route_id=t.route_id WHERE b.user_id=? AND (t.trip_id IS NULL OR r.start_station_id=?)"
        " AND COALESCE(b.destination_station_id,r.end_station_id)=?"
        " AND COALESCE(t.trip_date,b.requested_trip_date)=? AND COALESCE(t.slot_id,b.slot_id)=? AND b.booking_id<>?"
        " AND (b.status IN ('pending','confirmed') OR "+LIVE_CHOICE+") LIMIT 1",
        {user["user_id"],CAMPUS_STATION_ID,destination,date,slot,excluding});
    require(duplicate.empty(),"You already have a request for this departure.",409);
}

// Unassigned requests have no trip row to serialize demand on yet.
class RideRequestLock {
    Sql& sql;
    std::string key;
public:
    RideRequestLock(Sql& connection,std::string group) : sql(connection),key(std::move(group)) {
        const auto rows = sql.query("SELECT GET_LOCK(SHA2(CONCAT(DATABASE(),':',?),256),5) AS acquired",{key});
        require(integer(rows[0],"acquired")==1,"Requests are busy for this departure. Please try again.",409);
    }
    ~RideRequestLock() {
        try { sql.query("SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(),':',?),256))",{key}); }
        catch (...) {} // The connection closes after serving this request.
    }
};

Json Service::availableOriginalTrip(const Json& b, int tripId) {
    const auto requested=b["requested_time"];
    const auto rows=sql.query(
        "SELECT t.trip_id,t.slot_id,t.departure_time,v.reg_number FROM TRIP t"
        " JOIN ROUTE r ON r.route_id=t.route_id JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id"
        " WHERE r.start_station_id=? AND r.end_station_id=?"
        " AND t.departure_time>=? AND t.departure_time<=DATE_ADD(?,INTERVAL ? MINUTE)"
        " AND t.departure_time<DATE_ADD(DATE(?),INTERVAL 1 DAY)"
        " AND t.departure_time>NOW() AND t.status='scheduled' AND v.status='active' AND t.seats_filled<v.capacity"
        " AND (t.slot_id IS NULL OR t.departure_time=?) AND (?=0 OR t.trip_id=?)"
        " ORDER BY t.departure_time,t.trip_id LIMIT 1",
        {CAMPUS_STATION_ID,b["destination_station_id"],requested,requested,ORIGINAL_MATCH_MINUTES,requested,requested,tripId,tripId});
    return rows.empty()?Json(nullptr):rows[0];
}

Result Service::originalRequestStatus(const Json& b) {
    Json offer=nullptr;
    const int tripId=integer(b,"original_offer_trip_id");
    if (tripId>0) {
        offer=availableOriginalTrip(b,tripId);
        if (!offer.is_null()) offer["departure_time"]=offsetTime(field(offer,"departure_time"));
    }
    const bool checked=b["expires_at"]!=b["original_review_at"];
    const auto outcome=offer.is_null()?(checked?"original_unavailable":"waiting_original"):"original_offer";
    return {Json{{"outcome",outcome},{"booking",b},{"offer",offer},
        {"choice_ttl_minutes",config.awaitingChoiceTtlMinutes}}};
}

Result Service::keepOriginalRide(int destination, const std::string& requested, const std::string& priority, int id, const Json& whatsappRecipient) {
    RideRequestLock lock(sql,"original:"+field(user,"user_id")+":"+std::to_string(destination)+":"+requested);
    Transaction transaction(sql);
    if (id) {
        const auto rows=sql.query("SELECT status,original_review_at,expires_at>NOW() AS still_open FROM BOOKING"
                                  " WHERE booking_id=? AND user_id=? FOR UPDATE",{id,user["user_id"]});
        require(!rows.empty(),"Booking not found.",404);
        require(field(rows[0],"status")=="awaiting_choice" && integer(rows[0],"still_open"),
                "This request is no longer open.",409);
        if (!rows[0]["original_review_at"].is_null()) {
            transaction.commit();
            return originalRequestStatus(booking(id));
        }
    }
    require(campusTimestamp(requested)>std::time(nullptr),"Choose a preferred departure time in the future.",422);
    const auto duplicate=sql.query("SELECT booking_id FROM BOOKING WHERE user_id=? AND destination_station_id=?"
        " AND requested_time=? AND status='awaiting_choice' AND original_review_at IS NOT NULL AND expires_at>NOW()",
        {user["user_id"],destination,requested});
    require(duplicate.empty(),"You are already waiting for this destination and preferred time.",409);
    if (id) {
        sql.query("UPDATE BOOKING SET trip_id=NULL,slot_id=NULL,requested_trip_date=DATE(requested_time),"
            " original_review_at=DATE_ADD(NOW(),INTERVAL ? MINUTE),expires_at=original_review_at WHERE booking_id=?",
            {config.awaitingChoiceTtlMinutes,id});
        sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE booking_id=? AND type IN ('low_demand','ride_options')"
                  " AND channel='in_app'",{id});
    } else {
        sql.query("INSERT INTO BOOKING(user_id,destination_station_id,requested_time,requested_trip_date,priority,status,"
            " original_review_at,expires_at,whatsapp_recipient)"
            " VALUES (?,?,?,DATE(?),?,'awaiting_choice',DATE_ADD(NOW(),INTERVAL ? MINUTE),DATE_ADD(NOW(),INTERVAL ? MINUTE),?)",
            {user["user_id"],destination,requested,requested,priority,config.awaitingChoiceTtlMinutes,
             config.awaitingChoiceTtlMinutes,whatsappRecipient});
        id=static_cast<int>(sql.insertId());
    }
    const auto saved = booking(id);
    notice(integer(user,"user_id"),id,"original_ride_requested",
        "Your request to "+field(saved,"destination")+" for "+requested.substr(0,16)+
        " India time is saved. We'll let you know whether a ride is available.");
    transaction.commit();
    return originalRequestStatus(saved);
}

void Service::reviewPendingRequests() {
    expireChoices(nullptr);
    const auto due=sql.query("SELECT booking_id FROM BOOKING WHERE status='awaiting_choice'"
        " AND original_review_at IS NOT NULL AND expires_at<=NOW() ORDER BY expires_at,booking_id LIMIT 100");
    for (const auto& item : due) {
        const auto id=integer(item,"booking_id");
        Transaction transaction(sql);
        const auto rows=sql.query("SELECT b.*,s.name AS destination FROM BOOKING b"
            " JOIN STATION s ON s.station_id=b.destination_station_id WHERE b.booking_id=?"
            " AND b.status='awaiting_choice' AND b.original_review_at IS NOT NULL AND b.expires_at<=NOW() FOR UPDATE",{id});
        if (!rows.empty()) {
            const auto& b=rows[0];
            const bool previouslyOffered=field(b,"expires_at")!=field(b,"original_review_at");
            const auto ride=previouslyOffered?Json(nullptr):availableOriginalTrip(b);
            const auto destination=field(b,"destination");
            const auto owner=integer(b,"user_id");
            if (ride.is_null()) {
                sql.query("UPDATE BOOKING SET status='cancelled',original_offer_trip_id=NULL WHERE booking_id=?",{id});
                sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE booking_id=? AND type='original_ride_available'"
                          " AND channel='in_app'",{id});
                notice(owner,id,"original_ride_unavailable",previouslyOffered
                    ? "The offer for your ride to "+destination+" expired before you confirmed it."
                    : "No bus with an available seat was scheduled for "+destination+" around your preferred departure ("
                       +field(b,"requested_time").substr(0,16)+" India time). Your request has closed.");
            } else {
                sql.query("UPDATE BOOKING SET original_offer_trip_id=?,expires_at=? WHERE booking_id=?",
                          {ride["trip_id"],ride["departure_time"],id});
                notice(owner,id,"original_ride_available","A bus to "+destination+" is available at "+
                    field(ride,"departure_time").substr(0,16)+" India time. Confirm your ride before it departs.");
            }
        }
        transaction.commit();
    }
}

Result Service::confirmOriginalRide(int id, const Json& b) {
    const int tripId=integer(b,"original_offer_trip_id");
    require(tripId>0,"There is no bus available to confirm for this request yet.",409);
    Transaction transaction(sql);
    const auto target=lockTrip(tripId);
    const auto rows=sql.query("SELECT * FROM BOOKING WHERE booking_id=? AND user_id=? AND status='awaiting_choice'"
        " AND original_offer_trip_id=? AND expires_at>NOW() FOR UPDATE",{id,user["user_id"],tripId});
    require(!rows.empty(),"This offer is no longer open.",409);
    require(!availableOriginalTrip(rows[0],tripId).is_null(),"This bus is no longer available. Please request another ride.",409);
    sql.query("UPDATE BOOKING SET trip_id=?,slot_id=?,status='confirmed',original_offer_trip_id=NULL WHERE booking_id=?",
              {tripId,target["slot_id"],id});
    sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE booking_id=? AND type='original_ride_available'"
              " AND channel='in_app'",{id});
    confirmedNotice(id);
    transaction.commit();
    const auto confirmed=booking(id);
    return {Json{{"outcome","confirmed"},{"booking",confirmed},{"departure",confirmed["departure"]},
                 {"message","Your ride is confirmed."}}};
}

Result Service::requestRide(const Json& body) {
    const auto role = field(user,"role");
    require(role=="student" || role=="faculty","Only students and faculty can request a ride.",403);
    const auto priority = field(body,"priority","normal");
    choice(priority,{"normal","urgent"},"priority");
    const int destination = integer(body,"destination_station_id");
    require(destination>0,"Choose a destination station.");
    const auto preferred = field(body,"preferred_time");
    const auto date = field(body,"date");
    const bool hasNewInput = body.contains("date") || body.contains("preferred_time");
    const auto requestedTime=normalizeTime(hasNewInput ? validateDate(date)+"T"+preferred : field(body,"requested_time"));
    const auto station=sql.query("SELECT name FROM STATION WHERE station_id=?",{destination});
    require(!station.empty(),"Destination station not found.");
    Json whatsappRecipient=nullptr;
    if (body.value("whatsapp_updates",false)) {
        const auto contact=field(user,"contact_info");
        require(config.whatsappEnabled,"WhatsApp ride updates are unavailable on this server.",422);
        require(validWhatsappNumber(contact),"Use an account contact number with its country code for WhatsApp updates.",422);
        whatsappRecipient=contact;
    }
    if (body.value("wait_for_original",false)) return keepOriginalRide(destination,requestedTime,priority,0,whatsappRecipient);
    const auto departures=slots();
    auto assigned=assignSlot(requestedTime,departures);
    const auto now = std::time(nullptr);
    const auto today = campusDate(now);
    require(requestedTime.substr(0,10)>=today,"Choose today or a future travel date.",422);
    const auto slotTime = [&](const Json& slot) {
        const auto it = std::find_if(departures.begin(),departures.end(),[&](const Json& entry) {
            return entry["slot_id"]==slot["slot_id"];
        });
        return field(slot,"trip_date")+" "+field(*it,"departure_time");
    };
    const bool alreadyDeparted = campusTimestamp(slotTime(assigned))<=now;
    if (alreadyDeparted) {
        for (const auto& slot : departures) {
            const auto departure = today+" "+field(slot,"departure_time");
            if (campusTimestamp(departure)>now) {
                assigned = assignSlot(departure,departures);
                break;
            }
        }
        if (campusTimestamp(slotTime(assigned))<=now) assigned = assignSlot(today+"T23:59:59",departures);
    }
    expireChoices(user["user_id"]);

    RideRequestLock demandLock(sql,"ride:"+std::to_string(destination)+":"+field(assigned,"trip_date")+":"+field(assigned,"slot_id"));
    Transaction transaction(sql);
    const auto trip = lockRideTrip(destination,assigned["trip_date"],assigned["slot_id"],true);
    ensureNoActiveRide(destination,assigned["trip_date"],assigned["slot_id"]);
    const int count = rideDemand(destination,assigned["trip_date"],assigned["slot_id"])+1;
    const bool low = count<config.highDemandThreshold;
    const bool awaiting = low || trip.is_null();
    if (!awaiting) require(integer(trip,"seats_filled")<integer(trip,"capacity"),TRIP_FULL,409);
    sql.query("INSERT INTO BOOKING(user_id,trip_id,priority,status,destination_station_id,requested_time,"
        " slot_id,requested_trip_date,expires_at,whatsapp_recipient)"
        " VALUES (?,?,?,?,?,?,?,?,IF(?,LEAST(DATE_ADD(NOW(),INTERVAL ? MINUTE),?),NULL),?)",
        {user["user_id"],trip.is_null()?Json(nullptr):trip["trip_id"],priority,awaiting?"awaiting_choice":"confirmed",
         destination,requestedTime,assigned["slot_id"],assigned["trip_date"],awaiting?1:0,config.awaitingChoiceTtlMinutes,
         trip.is_null()?Json(slotTime(assigned)):trip["departure_time"],whatsappRecipient});
    const auto id = static_cast<int>(sql.insertId());
    const auto stationName = field(station[0],"name");
    const auto label = field(assigned,"label");
    if (awaiting) {
        const auto context = low ? "Only "+std::to_string(count)+" request(s) so far for "+stationName+" at "+label+"."
                                 : "No direct bus is scheduled for "+stationName+" at "+label+".";
        notice(integer(user,"user_id"),id,low?"low_demand":"ride_options",context+
            " Keep your original request or choose another departure.");
    } else confirmedNotice(id);
    transaction.commit();
    const auto b = booking(id);
    std::string message = awaiting?"Choose a departure to confirm your request.":"Your ride is confirmed.";
    if (alreadyDeparted) message += " The departure for your preferred time has passed. Your request moved to "+label+
        " ("+field(assigned,"trip_date")+").";
    else if (assigned["next_day"].get<bool>()) message += " Your preferred time maps to 1:00 PM the next day ("+field(assigned,"trip_date")+").";
    return {Json{{"outcome",low?"low_demand":awaiting?"awaiting_choice":"confirmed"},{"booking",b},{"departure",b["departure"]},
        {"options",awaiting?rideOptions(b):Json(nullptr)},{"demandCount",count},{"low_demand",low},
        {"demandStatus",low?"LOW":"HIGH"},{"actionTaken",awaiting?"AWAITING_CHOICE":"DIRECT_TRIP_ALLOCATED"},
        {"direct_trip_scheduled",!trip.is_null()},{"time_adjusted",alreadyDeparted},
        {"next_day",assigned["next_day"]},{"choice_ttl_minutes",config.awaitingChoiceTtlMinutes},{"message",message}},200,message};
}

Result Service::resolveRide(int id, const Json& body) {
    const auto original = booking(id);
    require(original["user_id"]==user["user_id"],"You can only access your own bookings.",403);
    expireChoices(user["user_id"]);
    const auto current = booking(id);
    require(field(current,"status")=="awaiting_choice","This request is no longer awaiting your choice.",409);
    const auto action = field(body,"action");
    choice(action,{"choose_slot","choose_nearby","choose_departure","cancel","wait_original","confirm_original"},"request action");
    if (action=="wait_original") return keepOriginalRide(integer(current,"destination_station_id"),
        field(current,"requested_time"),field(current,"priority"),id);
    if (action=="confirm_original") return confirmOriginalRide(id,current);
    require(current["original_review_at"].is_null(),"This request is waiting for its original destination and time.",409);
    const auto date = current["trip_date"];
    int destination = integer(current,"destination_station_id");
    const int slot = integer(body,"slot_id");
    if (action=="choose_nearby") {
        const auto alternatives = nearbyStations(destination,NEARBY_RADIUS_KM);
        destination = integer(body,"destination_station_id");
        require(std::any_of(alternatives.begin(),alternatives.end(),[&](const Json& entry){return entry["station_id"]==destination;}),
                "Choose a nearby destination from the available options.");
    }
    if (action=="choose_departure") {
        destination = integer(body,"destination_station_id");
        require(destination>0,"Choose a destination from the college timetable.");
    }
    if (action!="cancel") require(slot>0,"Choose a departure slot.");

    Transaction transaction(sql);
    Json target;
    if (action!="cancel") target = lockRideTrip(destination,date,slot);
    const auto locked = sql.query("SELECT booking_id,trip_id,user_id,status FROM BOOKING WHERE booking_id=? FOR UPDATE",{id});
    require(!locked.empty(),"Booking not found.",404);
    auto b = locked[0];
    require(field(b,"status")=="awaiting_choice","This request is no longer awaiting your choice.",409);
    b["due"] = sql.query("SELECT "+CHOICE_DUE+" AS due FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
                         " WHERE b.booking_id=?",{id})[0]["due"];
    if (expireChoice(b)) {
        transaction.commit();
        throw Error(409,CHOICE_EXPIRED);
    }
    if (action=="cancel") {
        sql.query("UPDATE BOOKING SET status='cancelled' WHERE booking_id=?",{id});
        notice(integer(b,"user_id"),id,"booking_cancelled","Your ride request was cancelled.");
        transaction.commit();
        return {Json{{"outcome","cancelled"},{"booking",booking(id)},{"departure",nullptr},{"options",nullptr},
                    {"message","Your request was cancelled."}}};
    }
    require(integer(target,"seats_filled")<integer(target,"capacity"),TRIP_FULL,409);
    ensureNoActiveRide(destination,date,slot,id);
    const int demand = rideDemand(destination,date,slot,id)+1;
    sql.query("UPDATE BOOKING SET trip_id=?,destination_station_id=?,slot_id=?,status='confirmed' WHERE booking_id=?",
              {target["trip_id"],destination,slot,id});
    confirmedNotice(id,demand<config.highDemandThreshold?rideDemand(destination,date,slot,0,true):0);
    transaction.commit();
    b = booking(id);
    return {Json{{"outcome","confirmed"},{"booking",b},{"departure",b["departure"]},{"options",nullptr},
                 {"message","Your ride is confirmed."}}};
}

Result Service::bookings(const std::string& method,int id,const std::string& action,const Json& query,const Json& body) {
    if (method=="GET" && action=="options") {
        const auto original = booking(id);
        require(original["user_id"]==user["user_id"],"You can only access your own bookings.",403);
        expireChoices(user["user_id"]);
        const auto b = booking(id);
        require(field(b,"status")=="awaiting_choice","This request is no longer awaiting your choice.",409);
        if (!b["original_review_at"].is_null()) return originalRequestStatus(b);
        const auto options = rideOptions(b);
        const auto slot = std::find_if(options["slots"].begin(),options["slots"].end(),[&](const Json& entry) {
            return entry["slot_id"]==b["slot_id"] && entry["scheduled"]==true;
        });
        const auto count = rideDemand(integer(b,"destination_station_id"),b["trip_date"],b["slot_id"]);
        return {Json{{"booking",b},{"options",options},{"choice_ttl_minutes",config.awaitingChoiceTtlMinutes},
                     {"demandCount",count},{"low_demand",count<config.highDemandThreshold},
                     {"direct_trip_scheduled",slot!=options["slots"].end()}}};
    }
    if (method=="POST" && action=="resolve") return resolveRide(id,body);
    if (method=="POST" && action=="request") return requestRide(body);
    if (method=="GET" && action.empty()) {
        expireChoices(field(user,"role")=="admin"?Json(nullptr):user["user_id"]);
        if (id) {
            auto b=booking(id);
            ownBooking(b);
            if (b["whatsapp_updates"]==true) {
                const auto updates=sql.query("SELECT status FROM NOTIFICATION_LOG WHERE booking_id=?"
                    " AND channel='whatsapp' ORDER BY notification_id DESC LIMIT 1",{id});
                b["whatsapp_status"]=updates.empty()?Json(nullptr):updates[0]["status"];
            }
            return {b};
        }
        return {bookingRows(query,true)};
    }
    if (method=="POST" && action.empty() && !id) {
        const auto priority=field(body,"priority","normal");
        const int tripId=integer(body,"trip_id");
        require(tripId>0,"Choose a trip.");
        expireChoices(user["user_id"]);
        Transaction transaction(sql);
        auto b=insertBooking(integer(user,"user_id"),tripId,priority);
        transaction.commit();return {b,201,"Seat confirmed."};
    }
    require(id>0,"Booking not found.",404);auto b=booking(id);ownBooking(b);
    if (method=="DELETE"){admin();sql.query("DELETE FROM BOOKING WHERE booking_id=?",{id});return {Json{{"booking_id",id}},200,"Booking deleted."};}
    require(method=="PUT" && (action=="cancel" || action=="status"),"Endpoint not found.",404);
    auto status=action=="cancel"?"cancelled":field(body,"status");if(action=="status")admin();choice(status,{"confirmed","pending","rejected","cancelled"},"booking status");
    expireChoices(b["user_id"]);
    Transaction transaction(sql);
    if (!b["trip_id"].is_null()) lockTrip(integer(b,"trip_id"));
    if (status=="confirmed") require(!b["trip_id"].is_null(),"Choose a scheduled departure before confirming this request.",409);
    auto locked=sql.query("SELECT status,trip_id FROM BOOKING WHERE booking_id=? FOR UPDATE",{id});require(!locked.empty(),"Booking not found.",404);
    require(locked[0]["trip_id"]==b["trip_id"],"The booking changed. Please try again.",409);
    if(action=="cancel")require(field(locked[0],"status")!="cancelled","This booking has already been cancelled.");
    sql.query("UPDATE BOOKING SET status=?,original_offer_trip_id=NULL WHERE booking_id=?",{status,id});
    if (status!=field(locked[0],"status")) {
        if (status=="confirmed") confirmedNotice(id);
        else if (status=="cancelled") notice(integer(b,"user_id"),id,"booking_cancelled","Your ride booking was cancelled.");
        else if (status=="rejected") notice(integer(b,"user_id"),id,"booking_rejected","Your ride request was declined.");
    }
    if(status=="cancelled")sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE booking_id=? AND type IN ('low_demand','ride_options','original_ride_available') AND channel='in_app'",{id});
    transaction.commit();return {booking(id),200,status=="cancelled"?"Booking cancelled.":"Booking status updated."};
}
Json Service::slotSummary(const std::string& date) {
    const auto destinations = sql.query("SELECT DISTINCT s.station_id,s.name FROM STATION s WHERE s.station_id<>? ORDER BY s.name",{CAMPUS_STATION_ID});
    const auto counts = sql.query("SELECT COALESCE(t.slot_id,b.slot_id) AS slot_id,COALESCE(b.destination_station_id,r.end_station_id) AS station_id,"
        " COUNT(*) AS n,SUM(b.status='confirmed') AS confirmed,SUM(b.status='awaiting_choice') AS awaiting,"
        " SUM(b.status='pending') AS pending FROM BOOKING b LEFT JOIN TRIP t ON t.trip_id=b.trip_id"
        " LEFT JOIN ROUTE r ON r.route_id=t.route_id WHERE COALESCE(t.trip_date,b.requested_trip_date)=?"
        " AND (b.status IN ('pending','confirmed') OR "+LIVE_CHOICE+")"
        " GROUP BY COALESCE(t.slot_id,b.slot_id),COALESCE(b.destination_station_id,r.end_station_id)",{date});
    const auto seats = sql.query("SELECT t.slot_id,r.end_station_id AS station_id,SUM(GREATEST(0,v.capacity-t.seats_filled))"
        " AS n FROM TRIP t JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id JOIN ROUTE r ON r.route_id=t.route_id"
        " WHERE t.trip_date=? AND t.status='scheduled' AND v.status='active' GROUP BY t.slot_id,r.end_station_id",{date});
    Json result = Json::array();
    for (const auto& slot : slots()) for (const auto& destination : destinations) {
        const auto matches = [&](const Json& row) {
            return row["slot_id"]==slot["slot_id"] && row["station_id"]==destination["station_id"];
        };
        const auto requests = std::find_if(counts.begin(),counts.end(),matches);
        const auto available = std::find_if(seats.begin(),seats.end(),matches);
        const auto count = requests==counts.end()?0:integer(*requests,"n");
        result.push_back(Json{{"slot_id",slot["slot_id"]},{"slot_label",slot["label"]},{"departure_time",slot["departure_time"]},
            {"station_id",destination["station_id"]},{"station",destination["name"]},{"request_count",count},
            {"confirmed_count",requests==counts.end()?0:integer(*requests,"confirmed")},
            {"awaiting_choice_count",requests==counts.end()?0:integer(*requests,"awaiting")},
            {"pending_count",requests==counts.end()?0:integer(*requests,"pending")},
            {"seats_available",available==seats.end()?0:integer(*available,"n")},{"low_demand",count<config.highDemandThreshold}});
    }
    return result;
}
static std::string derived(const Json& allocations,const std::string& empty) {for(const auto& trip:allocations)if(field(trip,"status")=="departed")return "on trip";for(const auto& trip:allocations)if(field(trip,"status")=="scheduled")return "allocated";return empty;}
Json Service::fleet(const std::string& date) {
    auto result=sql.query("SELECT * FROM VEHICLE ORDER BY vehicle_id"),day=trips(Json{{"date",date}});
    for(auto& vehicle:result){Json allocations=Json::array();for(const auto& t:day)if(t["vehicle_id"]==vehicle["vehicle_id"])allocations.push_back(t);vehicle["allocations"]=allocations;auto state=field(vehicle,"status");vehicle["fleet_status"]=state=="maintenance"?"in maintenance":state=="inactive"?"inactive":derived(allocations,"idle");}return result;
}
Json Service::drivers(const std::string& date) {
    auto result=sql.query("SELECT * FROM DRIVER ORDER BY name"),day=trips(Json{{"date",date}});
    for(auto& driver:result){Json allocations=Json::array();for(const auto& t:day)if(t["driver_id"]==driver["driver_id"])allocations.push_back(t);driver["trips"]=allocations;driver["derived_status"]=derived(allocations,"available");}return result;
}
Result Service::adminView(const std::string& path,const Json& query) {
    admin();auto date=validateDate(field(query,"date",campusDate()));
    if(path=="/api/admin/bookings"){expireChoices(nullptr);return {bookingRows(query,false)};}
    if(path=="/api/admin/slots/summary")return {slotSummary(date)};
    if(path=="/api/admin/fleet")return {fleet(date)};
    if(path=="/api/admin/drivers/status")return {drivers(date)};
    if(path=="/api/admin/demand/hourly") {
        std::string where=" AND b.requested_time>=? AND b.requested_time<DATE_ADD(?,INTERVAL 1 DAY)";std::vector<Json> parameters={date,date};
        if(!field(query,"station_id").empty()){where+=" AND b.destination_station_id=?";parameters.push_back(integer(query,"station_id"));}
        return {sql.query("SELECT b.destination_station_id AS station_id,s.name AS station,CONCAT(LPAD(HOUR(b.requested_time),2,'0'),':00') AS hour_start,CONCAT(LPAD(HOUR(b.requested_time)+1,2,'0'),':00') AS hour_end,COUNT(*) AS request_count, SUM(b.status='awaiting_choice' AND b.original_review_at IS NOT NULL) AS original_request_count FROM BOOKING b JOIN STATION s ON s.station_id=b.destination_station_id LEFT JOIN TRIP t ON t.trip_id=b.trip_id WHERE (b.status IN ('pending','confirmed') OR "+LIVE_CHOICE+")"+where+" GROUP BY b.destination_station_id,s.name,hour_start,hour_end ORDER BY s.name,hour_start",parameters)};
    }
    if(path=="/api/admin/allocations") {
        auto day=trips(Json{{"date",date}}),departures=slots(),summary=slotSummary(date),buses=fleet(date),people=drivers(date);Json warnings=Json::array(),unassigned=Json::array();
        for(const auto& t:day){if(integer(t,"seats_filled")>=integer(t,"capacity"))warnings.push_back("Trip #"+field(t,"trip_id")+" to "+field(t,"end_station_name")+" at "+field(t,"slot_label")+" is full.");if(t["slot_id"].is_null())unassigned.push_back(t);}
        for(const auto& row:summary)if(row["low_demand"].get<bool>())warnings.push_back("Low demand for "+field(row,"station")+" at "+field(row,"slot_label")+": "+field(row,"request_count")+" requests.");
        for(const auto& bus:buses)if(field(bus,"status")=="active")for(const auto& slot:departures){bool found=false;for(const auto& t:bus["allocations"])if(t["slot_id"]==slot["slot_id"])found=true;if(!found)warnings.push_back("Bus "+field(bus,"reg_number")+" has no trip at "+field(slot,"label")+".");}
        for(const auto& person:people)if(person["trips"].empty())warnings.push_back("Driver "+field(person,"name")+" has no trip on "+date+".");
        for(auto& slot:departures){slot["trips"]=Json::array();for(const auto& t:day)if(t["slot_id"]==slot["slot_id"])slot["trips"].push_back(t);}
        return {Json{{"date",date},{"slots",departures},{"warnings",warnings},{"unassigned_trips",unassigned}}};
    }
    throw Error(404,"Endpoint not found.");
}
Result Service::handle(const std::string& method,const std::string& path,const Json& query,const Json& body,const std::string& authorization) {
    if(path=="/api/health" && method=="GET")return {Json{{"status","healthy"},{"backend","cpp"},{"database","mysql"}}};
    if((path=="/api/auth/login" || path=="/api/auth/signup") && method=="POST")return auth(path.substr(path.rfind('/')+1),body);
    bool publicRead=method=="GET" && std::regex_match(path,std::regex(R"(/api/(stations|vehicles|drivers|routes|trips)(/[0-9]+)?(/nearby)?)"));
    if(!publicRead) {
        require(authorization.size()>7 && authorization.substr(0,7)=="Bearer ","Please sign in to continue.",401);
        require(authorization.size()<=4103,"Invalid token.",401);user=profile(verifyToken(authorization.substr(7),config.jwtSecret));
    }
    if(path=="/api/auth/me" && method=="GET")return {user};
    if(path=="/api/slots" && method=="GET")return {slots()};
    if(path.rfind("/api/admin/",0)==0){require(method=="GET","Method not allowed.",405);return adminView(path,query);}
    if(path=="/api/notifications" && method=="GET") {
        expireChoices(user["user_id"]);
        return {sql.query("SELECT n.*,b.status AS booking_status,"
            " EXISTS(SELECT 1 FROM NOTIFICATION_LOG e WHERE e.booking_id=n.booking_id AND e.type='booking_expired'"
            " AND e.channel='in_app') AS booking_expired"
            " FROM NOTIFICATION_LOG n LEFT JOIN BOOKING b ON b.booking_id=n.booking_id"
            " WHERE n.user_id=? AND n.channel='in_app' AND n.is_read=FALSE ORDER BY n.sent_at DESC,n.notification_id DESC",{user["user_id"]})};
    }
    std::smatch match;
    if(std::regex_match(path,match,std::regex(R"(/api/notifications/([0-9]+)/read)")) && method=="PUT") {
        int id=std::stoi(match[1]);auto rows=sql.query("SELECT notification_id FROM NOTIFICATION_LOG WHERE notification_id=? AND user_id=? AND channel='in_app'",{id,user["user_id"]});require(!rows.empty(),"Notification not found.",404);sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE notification_id=?",{id});return {Json{{"notification_id",id},{"is_read",true}}};
    }
    if(std::regex_match(path,match,std::regex(R"(/api/stations/([0-9]+)/nearby)")) && method=="GET") {
        const int origin = std::stoi(match[1]);
        double radius=NEARBY_RADIUS_KM;
        try { if(!field(query,"radius").empty()) radius=std::stod(field(query,"radius")); }
        catch(...) { throw Error(400,"Choose a valid radius."); }
        require(std::isfinite(radius)&&radius>0&&radius<=1000,"Choose a radius between 0 and 1000 km.");
        const auto nearby = nearbyStations(origin,radius);
        return {Json{{"origin_station_id",origin},{"radius_km",radius},{"count",nearby.size()},{"stations",nearby}}};
    }
    if(std::regex_match(path,match,std::regex(R"(/api/(stations|vehicles|drivers|routes)(?:/([0-9]+))?)")))return entity(method,match[1],match[2].matched?std::stoi(match[2]):0,body);
    if(std::regex_match(path,match,std::regex(R"(/api/trips(?:/([0-9]+))?(?:/(schedule-batch))?)")))return trip(method,match[1].matched?std::stoi(match[1]):0,match[2],query,body);
    if(path=="/api/bookings/request")return bookings(method,0,"request",query,body);
    if(std::regex_match(path,match,std::regex(R"(/api/bookings(?:/([0-9]+))?(?:/(cancel|status|options|resolve))?)")))return bookings(method,match[1].matched?std::stoi(match[1]):0,match[2],query,body);
    if(std::regex_match(path,match,std::regex(R"(/api/users(?:/([0-9]+))?)"))) {
        int id=match[1].matched?std::stoi(match[1]):0;require(id || field(user,"role")=="admin","Administrators only.",403);if(id)require(field(user,"role")=="admin" || user["user_id"]==id,"You can only access your own profile.",403);
        if(method=="GET"){if(id)return {profile(id)};return {sql.query("SELECT user_id,name,email,role,station_id,contact_info,created_at FROM USER ORDER BY user_id")};}
        if(method=="DELETE"){admin();require(id>0,"Choose a user.");Transaction transaction(sql);sql.query("DELETE FROM BOOKING WHERE user_id=?",{id});sql.query("DELETE FROM USER WHERE user_id=?",{id});transaction.commit();return {Json{{"user_id",id}}};}
        require(method=="PUT" && id>0,"Method not allowed.",405);auto current=profile(id);std::string updates;std::vector<Json> parameters;
        for(auto key:{"name","email","station_id","contact_info","password"})if(body.contains(key)){auto value=body[key];if(std::string(key)=="password"){require(field(body,key).size()>=8 && field(body,key).size()<=128,"Choose a password of 8–128 characters.");value=passwordHash(field(body,key));}if(!updates.empty())updates+=",";updates+=(std::string(key)=="password"?"password_hash":key)+std::string("=?");parameters.push_back(value);}
        require(!updates.empty(),"No profile changes were supplied.");parameters.push_back(id);sql.query("UPDATE USER SET "+updates+" WHERE user_id=?",parameters);return {profile(id),200,"Profile updated."};
    }
    throw Error(404,"Endpoint not found.");
}
}
