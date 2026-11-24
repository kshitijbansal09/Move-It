#include "web_service.hpp"
#include "geo.hpp"
#include "scheduling.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <set>
#include <sstream>
namespace web {
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
 t.departure_time,t.trip_date,t.status AS trip_status,t.seats_filled,ds.label AS slot_label,
 v.reg_number AS vehicle_reg,v.capacity AS vehicle_capacity,d.name AS driver_name,d.contact_info AS driver_contact,
 r.route_name,r.start_station_id,r.end_station_id,s.name AS start_station_name,e.name AS end_station_name,
 COALESCE(dest.name,e.name) AS destination FROM BOOKING b JOIN USER u ON u.user_id=b.user_id
 LEFT JOIN TRIP t ON t.trip_id=b.trip_id LEFT JOIN DEPARTURE_SLOT ds ON ds.slot_id=t.slot_id
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
    require(!rows.empty(),"Your account is unavailable. Please sign in again.",401);return rows[0];
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
    auto departure=field(row,"departure_time");row["bookingId"]=row["booking_id"];
    if(departure.empty()){row["minutes_remaining"]=nullptr;row["trip_details"]=nullptr;row["departure_time"]=nullptr;}
    else {
        row["minutes_remaining"]=std::max(0LL,static_cast<long long>(std::ceil(std::difftime(campusTimestamp(departure),std::time(nullptr))/60)));
        row["departure_time"]=offsetTime(departure);
        row["trip_details"]={{"tripId",row["trip_id"]},{"routeName",row["route_name"]},{"vehicleReg",row["vehicle_reg"]},{"vehicleCapacity",row["vehicle_capacity"]},{"driverName",row["driver_name"]},{"driverContact",row["driver_contact"]},{"departureTime",row["departure_time"]},{"slotLabel",row["slot_label"]}};
    }
    row["bus"]=field(row,"vehicle_reg").empty()?Json(nullptr):Json{{"reg_number",row["vehicle_reg"]},{"capacity",row["vehicle_capacity"]}};
    row["driver"]=field(row,"driver_name").empty()?Json(nullptr):Json{{"name",row["driver_name"]},{"contact_info",row["driver_contact"]}};
    row["route"]=field(row,"route_name").empty()?Json(nullptr):Json{{"name",row["route_name"]},{"start_station",row["start_station_name"]},{"end_station",row["end_station_name"]}};
    return row;
}
Json Service::bookingRows(const Json& filters,bool own) {
    std::string where=" WHERE 1=1";std::vector<Json> parameters;
    if(own && field(user,"role")!="admin"){where+=" AND b.user_id=?";parameters.push_back(user["user_id"]);}
    if(!field(filters,"date").empty()){where+=" AND t.trip_date=?";parameters.push_back(validateDate(field(filters,"date")));}
    for(auto key:{"station_id","slot_id","booking_id"})if(!field(filters,key).empty()) {
        where+=std::string(" AND ")+(std::string(key)=="station_id"?"COALESCE(b.destination_station_id,r.end_station_id)":std::string(key)=="slot_id"?"t.slot_id":"b.booking_id")+"=?";parameters.push_back(integer(filters,key));
    }
    if(!field(filters,"status").empty()){choice(field(filters,"status"),{"confirmed","pending","rejected","cancelled"},"booking status");where+=" AND b.status=?";parameters.push_back(filters["status"]);}
    auto rows=sql.query(BOOKINGS+where+" ORDER BY b.booking_time DESC,b.booking_id DESC",parameters);
    for(auto& row:rows)row=enrich(row);return rows;
}
Json Service::booking(int id){auto rows=bookingRows(Json{{"booking_id",id}},false);require(!rows.empty(),"Booking not found.",404);return rows[0];}
void Service::ownBooking(const Json& b){require(field(user,"role")=="admin" || b["user_id"]==user["user_id"],"You can only access your own bookings.",403);}
void Service::notice(int userId,int bookingId,const std::string& type,const std::string& message){sql.query("INSERT INTO NOTIFICATION_LOG(user_id,booking_id,channel,type,message,status) VALUES (?,?,'in_app',?,?,'sent')",{userId,bookingId,type,message});}
void Service::confirmedNotice(int id){auto b=booking(id);notice(integer(b,"user_id"),id,"booking_confirmed","Your seat is confirmed. Your bus leaves at "+field(b,"slot_label")+". Bus: "+field(b,"vehicle_reg")+". Driver: "+field(b,"driver_name")+".");}
Json Service::insertBooking(int userId,int tripId,const std::string& priority,const Json& metadata) {
    choice(priority,{"normal","urgent"},"priority");
    auto rows=sql.query("SELECT t.*,r.end_station_id,v.status AS vehicle_status FROM TRIP t JOIN ROUTE r ON r.route_id=t.route_id JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id WHERE t.trip_id=? FOR UPDATE",{tripId});
    require(!rows.empty(),"Trip not found.",404);const auto& trip=rows[0];require(field(trip,"status")=="scheduled","This trip is no longer scheduled.");require(field(trip,"vehicle_status")=="active","This bus is in maintenance or inactive",409);
    sql.query("INSERT INTO BOOKING(user_id,trip_id,priority,status,destination_station_id,requested_time,slot_id) VALUES (?,?,?,'confirmed',?,?,?)",{userId,tripId,priority,metadata.value("destination_station_id",trip["end_station_id"]),metadata.value("requested_time",trip["departure_time"]),trip["slot_id"]});
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
        auto current=sql.query("SELECT t.*,v.capacity FROM TRIP t JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id WHERE t.trip_id=? FOR UPDATE",{id});require(!current.empty(),"Trip not found.",404);require(field(current[0],"status")=="scheduled","Only scheduled trips can receive seats.");
        auto pending=sql.query("SELECT b.*,u.name AS user_name FROM BOOKING b JOIN USER u ON u.user_id=b.user_id WHERE b.trip_id=? AND b.status='pending' ORDER BY b.booking_time,b.booking_id",{id});
        std::vector<Request> requests;for(const auto& b:pending)requests.push_back({integer(b,"booking_id"),integer(b,"user_id"),field(b,"priority"),campusTimestamp(field(b,"booking_time")),field(b,"user_name")});
        auto allocation=allocateSeats(integer(current[0],"capacity"),integer(current[0],"seats_filled"),requests,policy);Json assigned=Json::array(),waitlisted=Json::array();
        for(const auto& request:allocation.assigned){sql.query("UPDATE BOOKING SET status='confirmed' WHERE booking_id=?",{request.bookingId});confirmedNotice(request.bookingId);assigned.push_back(Json{{"booking_id",request.bookingId},{"user_id",request.userId},{"queue_position",request.queuePos},{"allocation_status","assigned"}});}
        for(const auto& request:allocation.waitlisted)waitlisted.push_back(Json{{"booking_id",request.bookingId},{"user_id",request.userId},{"queue_position",request.queuePos},{"allocation_status","waitlisted"}});
        transaction.commit();return {Json{{"policy_applied",policy},{"allocation",{{"tripId",id},{"capacity",allocation.capacity},{"seatsFilled",allocation.seatsFilled},{"availableSeats",allocation.available},{"assigned",assigned},{"waitlisted",waitlisted}}}},200,"Seat scheduling completed."};
    }
    require(action.empty(),"Endpoint not found.",404);Json previous=Json::object();
    if(id){auto rows=sql.query("SELECT t.*,d.name AS driver_name FROM TRIP t JOIN DRIVER d ON d.driver_id=t.driver_id WHERE trip_id=?",{id});require(!rows.empty(),"Trip not found.",404);previous=rows[0];}
    if(isDriver)require(field(previous,"driver_name")==field(user,"name"),"You can only update your own trips.",403);
    if(method=="DELETE"){require(id>0,"Choose a trip.");sql.query("DELETE FROM TRIP WHERE trip_id=?",{id});return {Json{{"trip_id",id}},200,"Trip deleted."};}
    require(method=="POST" || method=="PUT","Method not allowed.",405);auto merged=previous;
    for(auto key:{"vehicle_id","route_id","driver_id","trip_date","slot_id","status"})if(body.contains(key))merged[key]=body[key];
    if(!merged.contains("status"))merged["status"]="scheduled";
    if(body.contains("departure_time") && !body.contains("trip_date") && !body.contains("slot_id")) {
        auto datetime=normalizeTime(field(body,"departure_time"));auto matching=sql.query("SELECT slot_id FROM DEPARTURE_SLOT WHERE departure_time=?",{datetime.substr(11)});require(!matching.empty(),"Choose a fixed departure: 1:00 PM, 4:00 PM or 6:00 PM.");merged["trip_date"]=datetime.substr(0,10);merged["slot_id"]=matching[0]["slot_id"];
    }
    choice(field(merged,"status"),{"scheduled","departed","completed"},"trip status");
    for(auto key:{"vehicle_id","route_id","driver_id","slot_id"})require(integer(merged,key)>0,std::string(key)+" is required.");
    auto date=validateDate(field(merged,"trip_date"));auto slot=sql.query("SELECT * FROM DEPARTURE_SLOT WHERE slot_id=?",{merged["slot_id"]});require(!slot.empty(),"Choose a valid departure slot.");
    auto vehicle=sql.query("SELECT status,capacity FROM VEHICLE WHERE vehicle_id=?",{merged["vehicle_id"]});require(!vehicle.empty(),"Bus not found.");require(field(vehicle[0],"status")=="active","This bus is in maintenance or inactive",409);require(integer(previous,"seats_filled")<=integer(vehicle[0],"capacity"),"The selected bus cannot hold the existing reservations.",409);
    auto departure=date+" "+field(slot[0],"departure_time");Transaction transaction(sql);
    if(id){sql.query("UPDATE TRIP SET vehicle_id=?,route_id=?,driver_id=?,trip_date=?,slot_id=?,departure_time=?,status=? WHERE trip_id=?",{merged["vehicle_id"],merged["route_id"],merged["driver_id"],date,merged["slot_id"],departure,merged["status"],id});sql.query("UPDATE BOOKING SET slot_id=? WHERE trip_id=?",{merged["slot_id"],id});}
    else{sql.query("INSERT INTO TRIP(vehicle_id,route_id,driver_id,trip_date,slot_id,departure_time,status) VALUES (?,?,?,?,?,?,?)",{merged["vehicle_id"],merged["route_id"],merged["driver_id"],date,merged["slot_id"],departure,merged["status"]});id=static_cast<int>(sql.insertId());}
    transaction.commit();return {trips(Json{{"trip_id",id}})[0],method=="POST"?201:200,"Trip saved."};
}
Result Service::bookings(const std::string& method,int id,const std::string& action,const Json& query,const Json& body) {
    if(method=="GET") {if(id){auto b=booking(id);ownBooking(b);return {b};}return {bookingRows(query,true)};}
    if(method=="POST" && (action.empty() || action=="request")) {
        auto priority=field(body,"priority","normal");choice(priority,{"normal","urgent"},"priority");Transaction transaction(sql);
        if(action=="request") {
            int destination=integer(body,"destination_station_id");require(destination>0,"Choose a destination station.");
            auto assigned=assignSlot(field(body,"requested_time"),slots());auto stations=sql.query("SELECT name FROM STATION WHERE station_id=?",{destination});require(!stations.empty(),"Destination station not found.");
            auto matches=sql.query("SELECT t.trip_id FROM TRIP t JOIN ROUTE r ON r.route_id=t.route_id JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id WHERE r.end_station_id=? AND t.trip_date=? AND t.slot_id=? AND t.status='scheduled' ORDER BY (t.seats_filled<v.capacity) DESC,t.trip_id LIMIT 1",{destination,assigned["trip_date"],assigned["slot_id"]});
            require(!matches.empty(),"No bus is scheduled for this destination at that time.",422);
            auto b=insertBooking(integer(user,"user_id"),integer(matches[0],"trip_id"),priority,Json{{"destination_station_id",destination},{"requested_time",assigned["requested_time"]}});
            auto count=sql.query("SELECT COUNT(*) AS n FROM BOOKING b JOIN TRIP t ON t.trip_id=b.trip_id WHERE b.destination_station_id=? AND t.slot_id=? AND t.trip_date=? AND b.status IN ('pending','confirmed')",{destination,assigned["slot_id"],assigned["trip_date"]});
            int n=integer(count[0],"n");bool low=n<config.lowDemandThreshold;
            if(low)notice(integer(user,"user_id"),integer(b,"booking_id"),"low_demand","Only "+std::to_string(n)+" request(s) so far for "+field(stations[0],"name")+". The college bus leaves at "+field(assigned,"label")+". If that works for you, keep your request. Otherwise you can cancel it.");
            auto message=assigned["next_day"].get<bool>()?"Your requested time is after 6:00 PM. Your bus leaves at 1:00 PM on the next day ("+field(assigned,"trip_date")+").":"Your bus leaves at "+field(assigned,"label")+".";
            transaction.commit();return {Json{{"booking",b},{"demandCount",n},{"low_demand",low},{"demandStatus",low?"LOW":"HIGH"},{"actionTaken","DIRECT_TRIP_ALLOCATED"},{"next_day",assigned["next_day"]},{"message",message}},200,message};
        }
        int tripId=integer(body,"trip_id");require(tripId>0,"Choose a trip.");auto b=insertBooking(integer(user,"user_id"),tripId,priority);transaction.commit();return {b,201,"Seat confirmed."};
    }
    require(id>0,"Booking not found.",404);auto b=booking(id);ownBooking(b);
    if(method=="DELETE"){admin();sql.query("DELETE FROM BOOKING WHERE booking_id=?",{id});return {Json{{"booking_id",id}},200,"Booking deleted."};}
    require(method=="PUT" && (action=="cancel" || action=="status"),"Endpoint not found.",404);
    auto status=action=="cancel"?"cancelled":field(body,"status");if(action=="status")admin();choice(status,{"confirmed","pending","rejected","cancelled"},"booking status");
    Transaction transaction(sql);auto locked=sql.query("SELECT status FROM BOOKING WHERE booking_id=? FOR UPDATE",{id});require(!locked.empty(),"Booking not found.",404);
    if(action=="cancel")require(field(locked[0],"status")!="cancelled","This booking has already been cancelled.");
    sql.query("UPDATE BOOKING SET status=? WHERE booking_id=?",{status,id});
    if(status=="confirmed" && field(locked[0],"status")!="confirmed")confirmedNotice(id);
    if(status=="cancelled")sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE booking_id=? AND type='low_demand' AND channel='in_app'",{id});
    transaction.commit();return {booking(id),200,status=="cancelled"?"Booking cancelled. Seat released.":"Booking status updated."};
}
Json Service::slotSummary(const std::string& date) {
    auto destinations=sql.query("SELECT DISTINCT s.station_id,s.name FROM STATION s JOIN ROUTE r ON r.end_station_id=s.station_id ORDER BY s.name");
    auto counts=sql.query("SELECT t.slot_id,COALESCE(b.destination_station_id,r.end_station_id) AS station_id,COUNT(*) AS n FROM BOOKING b JOIN TRIP t ON t.trip_id=b.trip_id JOIN ROUTE r ON r.route_id=t.route_id WHERE t.trip_date=? AND b.status IN ('pending','confirmed') GROUP BY t.slot_id,COALESCE(b.destination_station_id,r.end_station_id)",{date});
    auto seats=sql.query("SELECT t.slot_id,r.end_station_id AS station_id,SUM(GREATEST(0,v.capacity-t.seats_filled)) AS n FROM TRIP t JOIN VEHICLE v ON v.vehicle_id=t.vehicle_id JOIN ROUTE r ON r.route_id=t.route_id WHERE t.trip_date=? AND t.status='scheduled' GROUP BY t.slot_id,r.end_station_id",{date});
    Json result=Json::array();for(const auto& slot:slots())for(const auto& destination:destinations){int count=0,available=0;for(const auto& row:counts)if(row["slot_id"]==slot["slot_id"] && row["station_id"]==destination["station_id"])count=integer(row,"n");for(const auto& row:seats)if(row["slot_id"]==slot["slot_id"] && row["station_id"]==destination["station_id"])available=integer(row,"n");result.push_back(Json{{"slot_id",slot["slot_id"]},{"slot_label",slot["label"]},{"departure_time",slot["departure_time"]},{"station_id",destination["station_id"]},{"station",destination["name"]},{"request_count",count},{"seats_available",available},{"low_demand",count<config.lowDemandThreshold}});}return result;
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
    if(path=="/api/admin/bookings")return {bookingRows(query,false)};
    if(path=="/api/admin/slots/summary")return {slotSummary(date)};
    if(path=="/api/admin/fleet")return {fleet(date)};
    if(path=="/api/admin/drivers/status")return {drivers(date)};
    if(path=="/api/admin/demand/hourly") {
        std::string where=" AND b.requested_time>=? AND b.requested_time<DATE_ADD(?,INTERVAL 1 DAY)";std::vector<Json> parameters={date,date};
        if(!field(query,"station_id").empty()){where+=" AND b.destination_station_id=?";parameters.push_back(integer(query,"station_id"));}
        return {sql.query("SELECT b.destination_station_id AS station_id,s.name AS station,CONCAT(LPAD(HOUR(b.requested_time),2,'0'),':00') AS hour_start,CONCAT(LPAD(HOUR(b.requested_time)+1,2,'0'),':00') AS hour_end,COUNT(*) AS request_count FROM BOOKING b JOIN STATION s ON s.station_id=b.destination_station_id WHERE b.status IN ('pending','confirmed')"+where+" GROUP BY b.destination_station_id,s.name,hour_start,hour_end ORDER BY s.name,hour_start",parameters)};
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
    if(path=="/api/notifications" && method=="GET")return {sql.query("SELECT * FROM NOTIFICATION_LOG WHERE user_id=? AND channel='in_app' ORDER BY sent_at DESC,notification_id DESC",{user["user_id"]})};
    std::smatch match;
    if(std::regex_match(path,match,std::regex(R"(/api/notifications/([0-9]+)/read)")) && method=="PUT") {
        int id=std::stoi(match[1]);auto rows=sql.query("SELECT notification_id FROM NOTIFICATION_LOG WHERE notification_id=? AND user_id=? AND channel='in_app'",{id,user["user_id"]});require(!rows.empty(),"Notification not found.",404);sql.query("UPDATE NOTIFICATION_LOG SET is_read=TRUE WHERE notification_id=?",{id});return {Json{{"notification_id",id},{"is_read",true}}};
    }
    if(std::regex_match(path,match,std::regex(R"(/api/stations/([0-9]+)/nearby)")) && method=="GET") {
        auto origin=sql.query("SELECT * FROM STATION WHERE station_id=?",{std::stoi(match[1])});require(!origin.empty(),"Station not found.",404);double radius=15;try{if(!field(query,"radius").empty())radius=std::stod(field(query,"radius"));}catch(...){throw Error(400,"Choose a valid radius.");}require(std::isfinite(radius)&&radius>0&&radius<=1000,"Choose a radius between 0 and 1000 km.");Json nearby=Json::array();
        for(auto row:sql.query("SELECT * FROM STATION WHERE station_id<>?",{std::stoi(match[1])})){double distance=distanceKm(origin[0]["latitude"].get<double>(),origin[0]["longitude"].get<double>(),row["latitude"].get<double>(),row["longitude"].get<double>());if(distance<=radius){row["distance_km"]=distance;nearby.push_back(row);}}
        std::sort(nearby.begin(),nearby.end(),[](const Json& a,const Json& b){return a["distance_km"]<b["distance_km"];});return {Json{{"origin_station_id",std::stoi(match[1])},{"radius_km",radius},{"count",nearby.size()},{"stations",nearby}}};
    }
    if(std::regex_match(path,match,std::regex(R"(/api/(stations|vehicles|drivers|routes)(?:/([0-9]+))?)")))return entity(method,match[1],match[2].matched?std::stoi(match[2]):0,body);
    if(std::regex_match(path,match,std::regex(R"(/api/trips(?:/([0-9]+))?(?:/(schedule-batch))?)")))return trip(method,match[1].matched?std::stoi(match[1]):0,match[2],query,body);
    if(path=="/api/bookings/request")return bookings(method,0,"request",query,body);
    if(std::regex_match(path,match,std::regex(R"(/api/bookings(?:/([0-9]+))?(?:/(cancel|status))?)")))return bookings(method,match[1].matched?std::stoi(match[1]):0,match[2],query,body);
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
