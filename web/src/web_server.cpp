#include "web_service.hpp"
#include "httplib.h"
#include <filesystem>
#include <iostream>
namespace web {
int runWeb(int argc,char** argv) {
    try {
        const auto config=Config::load();const std::string mode=argc>1?argv[1]:"--serve";
        if(mode=="--init-db"){initializeSql(config);return 0;}
        if(mode=="--seed-schedule"){Sql sql(config);seedSchedule(sql);return 0;}
        if(mode!="--serve"){std::cerr<<"Use --serve, --init-db or --seed-schedule.\n";return 1;}
        // Validate the SQL connection before advertising a working web server.
        {Sql sql(config);sql.query("SELECT slot_id FROM DEPARTURE_SLOT LIMIT 1");}
        httplib::Server server;
        server.new_task_queue=[](){return new httplib::ThreadPool(8);};
        server.set_payload_max_length(1024*1024);
        server.set_read_timeout(10,0);server.set_write_timeout(10,0);
        server.set_default_headers({{"X-Content-Type-Options","nosniff"},{"Referrer-Policy","same-origin"}});
        const auto api=[&config](const httplib::Request& request,httplib::Response& response){
            response.set_header("Cache-Control","no-store");
            try {
                Json query=Json::object(),body=Json::object();for(const auto& parameter:request.params)query[parameter.first]=parameter.second;
                if(!request.body.empty()){body=Json::parse(request.body);if(!body.is_object())throw Error(400,"Send a JSON object.");}
                Sql sql(config);Service service(sql,config);
                auto result=service.handle(request.method,request.path,query,body,request.get_header_value("Authorization"));
                Json payload={{"success",true},{"data",result.data}};if(!result.message.empty())payload["message"]=result.message;
                if(request.path=="/api/health"){payload["status"]="healthy";payload["backend"]="cpp";}
                response.status=result.status;response.set_content(payload.dump(),"application/json; charset=utf-8");
            } catch(const Error& error){response.status=error.status;response.set_content(Json{{"success",false},{"message",error.what()}}.dump(),"application/json");}
            catch(const Json::exception&){response.status=400;response.set_content(Json{{"success",false},{"message","Check the JSON fields and their types."}}.dump(),"application/json");}
            catch(const std::exception& error){std::cerr<<"[C++ API] "<<error.what()<<'\n';response.status=500;response.set_content(Json{{"success",false},{"message","An unexpected server error occurred."}}.dump(),"application/json");}
        };
        server.Get(R"(/api/.*)",api);server.Post(R"(/api/.*)",api);server.Put(R"(/api/.*)",api);server.Delete(R"(/api/.*)",api);
        server.Options(R"(/api/.*)",[](const auto&,auto& response){response.status=204;});
        const auto assets=std::filesystem::path(config.staticDir)/"assets";
        if(std::filesystem::is_directory(assets))server.set_mount_point("/assets",assets.string());
        server.Get(R"(/(?:login|signup|dashboard|admin|driver|booking/[0-9]+)?)",[&config](const auto&,auto& response){
            auto index=std::filesystem::path(config.staticDir)/"index.html";
            if(!std::filesystem::is_regular_file(index)){response.status=503;response.set_content("Frontend is not built yet. Run make frontend, then restart make serve.","text/plain");return;}
            response.set_header("Cache-Control","no-cache");response.set_file_content(index.string(),"text/html; charset=utf-8");
        });
        server.set_error_handler([](const auto&,auto& response){if(response.status==404)response.set_content(Json{{"success",false},{"message","Page or API endpoint not found."}}.dump(),"application/json");});
        std::cout<<"Move It C++ + MySQL: http://"<<config.host<<":"<<config.port<<"\nDatabase: "<<config.dbName<<"\n"<<std::flush;
        if(!server.listen(config.host,static_cast<int>(config.port)))throw Error(500,"Unable to listen on the configured address and port.");
        return 0;
    }catch(const std::exception& error){std::cerr<<"Move It web startup: "<<error.what()<<'\n';return 1;}
}
}
