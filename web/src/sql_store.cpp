#include "sql_store.hpp"
#include <iostream>
#include <sstream>
#include <type_traits>
namespace web {
static Error sqlError(unsigned code,const std::string& message) {
    if(code==1062) {
        if(message.find("unique_vehicle_slot")!=std::string::npos)return Error(409,"This bus is already allocated in that slot");
        if(message.find("unique_driver_slot")!=std::string::npos)return Error(409,"This driver is already allocated in that slot");
        if(message.find("unique_user_trip")!=std::string::npos)return Error(409,"You already have a reservation for this trip.");
        return Error(409,"A record with this email, license or registration already exists.");
    }
    if(code==1644)return Error(409,message);
    if(code==1451 || code==1452)return Error(400,"The referenced record does not exist or is still in use.");
    if(code==1045 || code==1049 || code==2002 || code==2003)return Error(503,"Cannot connect to MySQL. Check the C++ project's database configuration and run make init-sql.");
    std::cerr<<"[MySQL "<<code<<"] "<<message<<'\n';return Error(500,"The database operation could not be completed.");
}
Sql::Sql(const Config& config,bool selectDatabase) {
    connection=mysql_init(nullptr);if(!connection)throw Error(503,"MySQL initialization failed.");
    unsigned timeout=5;mysql_options(connection,MYSQL_OPT_CONNECT_TIMEOUT,&timeout);
    if(!mysql_real_connect(connection,config.dbHost.c_str(),config.dbUser.c_str(),config.dbPassword.c_str(),selectDatabase?config.dbName.c_str():nullptr,config.dbPort,config.dbSocket.empty()?nullptr:config.dbSocket.c_str(),0)) {
        auto error=sqlError(mysql_errno(connection),mysql_error(connection));mysql_close(connection);connection=nullptr;throw error;
    }
    if(mysql_set_character_set(connection,"utf8mb4")) {auto error=sqlError(mysql_errno(connection),mysql_error(connection));mysql_close(connection);connection=nullptr;throw error;}
    raw("SET time_zone = '+05:30'");
    raw("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
}
Sql::~Sql(){if(connection)mysql_close(connection);}
void Sql::raw(const std::string& sql) {
    if(mysql_real_query(connection,sql.data(),sql.size()))throw sqlError(mysql_errno(connection),mysql_error(connection));
    MYSQL_RES* result=mysql_store_result(connection);if(result)mysql_free_result(result);
}
Json Sql::query(const std::string& sql,const std::vector<Json>& parameters) {
    auto deleter=[](MYSQL_STMT* statement){mysql_stmt_close(statement);};
    std::unique_ptr<MYSQL_STMT,decltype(deleter)> statement(mysql_stmt_init(connection),deleter);
    if(!statement)throw Error(503,"MySQL statement allocation failed.");
    auto fail=[&](){throw sqlError(mysql_stmt_errno(statement.get()),mysql_stmt_error(statement.get()));};
    if(mysql_stmt_prepare(statement.get(),sql.data(),sql.size()))fail();
    if(mysql_stmt_param_count(statement.get())!=parameters.size())throw Error(500,"SQL parameter count mismatch.");
    using NullFlag=std::remove_pointer_t<decltype(MYSQL_BIND{}.is_null)>;
    std::unique_ptr<NullFlag[]> nulls(new NullFlag[parameters.size()]{});
    std::vector<std::string> values(parameters.size());std::vector<MYSQL_BIND> bindings(parameters.size());
    std::vector<unsigned long> lengths(parameters.size());
    for(std::size_t i=0;i<parameters.size();i++) {
        values[i]=text(parameters[i]);lengths[i]=values[i].size();nulls[i]=parameters[i].is_null();
        bindings[i]={};bindings[i].buffer_type=MYSQL_TYPE_STRING;bindings[i].buffer=values[i].data();bindings[i].buffer_length=lengths[i];bindings[i].length=&lengths[i];bindings[i].is_null=&nulls[i];
    }
    if(!bindings.empty() && mysql_stmt_bind_param(statement.get(),bindings.data()))fail();
    if(mysql_stmt_execute(statement.get()))fail();
    last=mysql_stmt_insert_id(statement.get());changed=mysql_stmt_affected_rows(statement.get());
    Json rows=Json::array();
    std::unique_ptr<MYSQL_RES,decltype(&mysql_free_result)> metadata(mysql_stmt_result_metadata(statement.get()),mysql_free_result);
    if(!metadata)return rows;
    auto count=mysql_num_fields(metadata.get());auto fields=mysql_fetch_fields(metadata.get());
    std::vector<MYSQL_BIND> outputs(count);std::vector<std::vector<char>> buffers(count,std::vector<char>(4096));
    std::vector<unsigned long> sizes(count);std::unique_ptr<NullFlag[]> outputNull(new NullFlag[count]{});
    for(unsigned i=0;i<count;i++) {outputs[i]={};outputs[i].buffer_type=MYSQL_TYPE_STRING;outputs[i].buffer=buffers[i].data();outputs[i].buffer_length=buffers[i].size();outputs[i].length=&sizes[i];outputs[i].is_null=&outputNull[i];}
    if(mysql_stmt_bind_result(statement.get(),outputs.data()) || mysql_stmt_store_result(statement.get()))fail();
    for(;;) {
        int status=mysql_stmt_fetch(statement.get());if(status==MYSQL_NO_DATA)break;if(status!=0 && status!=MYSQL_DATA_TRUNCATED)fail();
        Json row=Json::object();
        for(unsigned i=0;i<count;i++) {
            std::string key=fields[i].name;if(outputNull[i]){row[key]=nullptr;continue;}
            std::string value;
            if(sizes[i]>buffers[i].size()) {
                std::vector<char> full(sizes[i]);MYSQL_BIND column{};column.buffer_type=MYSQL_TYPE_STRING;column.buffer=full.data();column.buffer_length=full.size();
                if(mysql_stmt_fetch_column(statement.get(),&column,i,0))fail();value.assign(full.data(),full.size());
            } else value.assign(buffers[i].data(),sizes[i]);
            switch(fields[i].type) {
                case MYSQL_TYPE_TINY:case MYSQL_TYPE_SHORT:case MYSQL_TYPE_LONG:case MYSQL_TYPE_LONGLONG:case MYSQL_TYPE_INT24:case MYSQL_TYPE_YEAR:row[key]=std::stoll(value);break;
                case MYSQL_TYPE_FLOAT:case MYSQL_TYPE_DOUBLE:case MYSQL_TYPE_DECIMAL:case MYSQL_TYPE_NEWDECIMAL:row[key]=std::stod(value);break;
                default:row[key]=value;
            }
        }
        rows.push_back(row);
    }
    return rows;
}
void initializeSql(const Config& config) {
    Sql sql(config,false);
    sql.raw("CREATE DATABASE IF NOT EXISTS `"+config.dbName+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    sql.raw("USE `"+config.dbName+"`");
    auto tables=sql.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",{config.dbName});
    if(integer(tables[0],"n")!=0)throw Error(409,"Initialization stopped: this database already has tables. Existing data was preserved. Use make seed-sql for more demo trips.");
    std::ifstream file(config.schemaFile);if(!file)throw Error(500,"Cannot read "+config.schemaFile+". Run from cpp-modular/.");
    std::string delimiter=";",buffer,line;
    while(std::getline(file,line)) {
        auto start=line.find_first_not_of(" \t\r");if(start==std::string::npos || line.compare(start,2,"--")==0)continue;
        if(line.compare(start,10,"DELIMITER ")==0){delimiter=line.substr(start+10);if(!delimiter.empty() && delimiter.back()=='\r')delimiter.pop_back();continue;}
        buffer+=line+'\n';auto end=buffer.find_last_not_of(" \t\r\n");
        if(end!=std::string::npos && end+1>=delimiter.size() && buffer.substr(end+1-delimiter.size(),delimiter.size())==delimiter) {
            sql.raw(buffer.substr(0,end+1-delimiter.size()));buffer.clear();
        }
    }
    if(buffer.find_first_not_of(" \t\r\n")!=std::string::npos)throw Error(500,"Incomplete SQL schema statement.");
    seedSchedule(sql);std::cout<<"Initialized MySQL database "<<config.dbName<<" with the C++ schema.\n";
}
void seedSchedule(Sql& sql) {
    auto routes=sql.query("SELECT route_id FROM ROUTE ORDER BY route_id"), slots=sql.query("SELECT * FROM DEPARTURE_SLOT ORDER BY departure_time");
    auto vehicles=sql.query("SELECT vehicle_id FROM VEHICLE WHERE status = 'active' ORDER BY vehicle_id"),drivers=sql.query("SELECT driver_id FROM DRIVER ORDER BY driver_id");
    // Demo resources are explicit and existing vehicles/drivers are never overwritten.
    while(vehicles.size()<routes.size()){sql.query("INSERT INTO VEHICLE(reg_number,capacity,status) VALUES (?,40,'active')",{"CPP-DEMO-"+randomHex(6)});vehicles.push_back(Json{{"vehicle_id",sql.insertId()}});}
    while(drivers.size()<routes.size()){sql.query("INSERT INTO DRIVER(name,license_no,contact_info) VALUES (?,?,?)",{"Demo driver "+std::to_string(drivers.size()+1),"CPP-DEMO-"+randomHex(6),"+919800000000"});drivers.push_back(Json{{"driver_id",sql.insertId()}});}
    int created=0;
    for(int day=0;day<7;day++)for(std::size_t si=0;si<slots.size();si++) {
        auto date=campusDate(std::time(nullptr)+day*86400);const auto& slot=slots[si];
        auto allocated=sql.query("SELECT vehicle_id,driver_id,route_id FROM TRIP WHERE trip_date = ? AND slot_id = ?",{date,slot["slot_id"]});
        for(std::size_t ri=0;ri<routes.size();ri++) {
            bool exists=false;for(const auto& t:allocated)if(t["route_id"]==routes[ri]["route_id"])exists=true;if(exists)continue;
            Json vehicle=nullptr,driver=nullptr;
            for(std::size_t i=0;i<vehicles.size();i++){auto candidate=vehicles[(i+day+si+ri)%vehicles.size()];bool used=false;for(const auto& t:allocated)if(t["vehicle_id"]==candidate["vehicle_id"])used=true;if(!used){vehicle=candidate;break;}}
            for(std::size_t i=0;i<drivers.size();i++){auto candidate=drivers[(i+day+si+ri)%drivers.size()];bool used=false;for(const auto& t:allocated)if(t["driver_id"]==candidate["driver_id"])used=true;if(!used){driver=candidate;break;}}
            if(vehicle.is_null() || driver.is_null()){std::cerr<<"No free demo resources for "<<date<<" "<<field(slot,"label")<<'\n';continue;}
            sql.query("INSERT INTO TRIP(vehicle_id,route_id,driver_id,trip_date,slot_id,departure_time) VALUES (?,?,?,?,?,?)",{vehicle["vehicle_id"],routes[ri]["route_id"],driver["driver_id"],date,slot["slot_id"],date+" "+field(slot,"departure_time")});
            allocated.push_back(Json{{"vehicle_id",vehicle["vehicle_id"]},{"driver_id",driver["driver_id"]},{"route_id",routes[ri]["route_id"]}});created++;
        }
    }
    std::cout<<"Schedule: "<<created<<" trips added; existing allocations preserved.\n";
}
}
