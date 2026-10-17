#include "web_common.hpp"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <algorithm>
#include <cmath>
#include <limits>
#include <iomanip>
#include <sstream>
namespace web {
std::string text(const Json& value) { return value.is_string() ? value.get<std::string>() : value.is_null() ? "" : value.dump(); }
std::string field(const Json& object, const std::string& key, const std::string& fallback) {
    return object.contains(key) && !object[key].is_null() ? text(object[key]) : fallback;
}
int integer(const Json& object, const std::string& key, int fallback) {
    if (object.contains(key) && object[key].is_number()) {
        double number = object[key].get<double>();
        if (!std::isfinite(number) || std::floor(number) != number || number < std::numeric_limits<int>::min() || number > std::numeric_limits<int>::max())
            throw Error(400,"Choose a valid whole number for " + key + ".");
        return static_cast<int>(number);
    }
    auto value = field(object,key);
    if (value.empty()) return fallback;
    try { std::size_t end; int number = std::stoi(value,&end); if (end != value.size()) throw Error(400,"Choose a valid number for " + key + "."); return number; }
    catch (const Error&) { throw; } catch (...) { throw Error(400,"Choose a valid number for " + key + "."); }
}
static std::string env(const char* key, const std::string& fallback = "") { const char* value = std::getenv(key); return value ? value : fallback; }
Config Config::load() {
    std::ifstream file(".env"); std::string line;
    while (std::getline(file,line)) {
        auto start=line.find_first_not_of(" \t\r");
        if (start == std::string::npos || line[start]=='#') continue;
        auto equals=line.find('=',start); if (equals==std::string::npos) continue;
        auto key=line.substr(start,equals-start); auto end=key.find_last_not_of(" \t"); key.resize(end+1);
        auto value=line.substr(equals+1); if (!value.empty() && value.back()=='\r') value.pop_back();
        if (value.size()>=2 && ((value.front()=='"' && value.back()=='"') || (value.front()=='\'' && value.back()=='\''))) value=value.substr(1,value.size()-2);
        if (!std::getenv(key.c_str())) setenv(key.c_str(),value.c_str(),0);
    }
    Config c;
    c.host=env("HOST",c.host); c.port=std::stoul(env("PORT","5002"));
    c.dbHost=env("DB_HOST",c.dbHost); c.dbPort=std::stoul(env("DB_PORT","3306"));
    c.dbUser=env("DB_USER",c.dbUser); c.dbPassword=env("DB_PASSWORD"); c.dbName=env("DB_NAME",c.dbName); c.dbSocket=env("DB_SOCKET_PATH");
    c.jwtSecret=env("JWT_SECRET"); if (c.jwtSecret.empty()) c.jwtSecret=randomHex(32);
    if (c.jwtSecret.size()<32) throw Error(500,"JWT_SECRET must contain at least 32 characters.");
    if (!std::regex_match(c.dbName,std::regex("[A-Za-z0-9_]+"))) throw Error(500,"DB_NAME may contain only letters, digits and underscores.");
    c.staticDir=env("STATIC_DIR",c.staticDir); c.schemaFile=env("SCHEMA_FILE",c.schemaFile);
    c.lowDemandThreshold=std::stoi(env("LOW_DEMAND_THRESHOLD","5"));
    if (!c.port || c.port>65535 || !c.dbPort || c.dbPort>65535 || c.lowDemandThreshold<1) throw Error(500,"Invalid port or demand threshold configuration.");
    return c;
}
static std::string formatUtc(std::time_t time, const char* pattern) {
    std::tm date{}; gmtime_r(&time,&date); char buffer[64]; std::strftime(buffer,sizeof buffer,pattern,&date); return buffer;
}
std::string campusDate(std::time_t now) { return formatUtc(now+19800,"%Y-%m-%d"); }
std::string validateDate(const std::string& value) {
    if (!std::regex_match(value,std::regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) throw Error(400,"Choose a valid date (YYYY-MM-DD).");
    std::tm date{}; std::istringstream input(value); input >> std::get_time(&date,"%Y-%m-%d");
    auto parsed=timegm(&date);
    if (input.fail() || formatUtc(parsed,"%Y-%m-%d")!=value) throw Error(400,"Choose a valid date (YYYY-MM-DD).");
    return value;
}
std::string normalizeTime(const std::string& value) {
    std::smatch match;
    static const std::regex pattern(R"(^([0-9]{4}-[0-9]{2}-[0-9]{2})[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?(Z|[+-][0-9]{2}:[0-9]{2})?$)");
    if (!std::regex_match(value,match,pattern)) throw Error(400,"requested_time must include a valid date and time.");
    validateDate(match[1]);
    int hour=std::stoi(match[2]), minute=std::stoi(match[3]), second=match[4].matched?std::stoi(match[4]):0;
    if (hour>23 || minute>59 || second>59) throw Error(400,"Choose a valid requested time.");
    std::string normalized=match[1].str()+" "+match[2].str()+":"+match[3].str()+":"+(match[4].matched?match[4].str():"00");
    if (match[5].matched) {
        std::tm date{}; std::istringstream input(normalized); input >> std::get_time(&date,"%Y-%m-%d %H:%M:%S");
        auto utc=timegm(&date); std::string zone=match[5]; int offset=0;
        if (zone!="Z") { int zh=std::stoi(zone.substr(1,2)), zm=std::stoi(zone.substr(4,2)); if (zh>23 || zm>59) throw Error(400,"Invalid timezone offset."); offset=(zh*60+zm)*60*(zone[0]=='-'?-1:1); }
        normalized=formatUtc(utc-offset+19800,"%Y-%m-%d %H:%M:%S");
    }
    return normalized;
}
std::time_t campusTimestamp(const std::string& value) {
    std::tm date{}; std::istringstream input(value); input >> std::get_time(&date,"%Y-%m-%d %H:%M:%S"); return timegm(&date)-19800;
}
std::string offsetTime(const std::string& value) { if (value.empty()) return ""; std::string result=value; if (result.size()>10) result[10]='T'; return result+"+05:30"; }
Json assignSlot(const std::string& value, const Json& slots) {
    const auto requested=normalizeTime(value); if (slots.empty()) throw Error(422,"No departure slots are configured.");
    Json slot=slots.front(); bool next=true;
    for (const auto& candidate:slots) if (field(candidate,"departure_time")>=requested.substr(11)) { slot=candidate; next=false; break; }
    const auto date=next?campusDate(campusTimestamp(requested)+86400):requested.substr(0,10);
    slot["trip_date"]=date; slot["requested_time"]=requested; slot["next_day"]=next;
    slot["departure_datetime"]=date+" "+field(slot,"departure_time"); return slot;
}
static std::string hex(const unsigned char* data, int size) {
    std::ostringstream out; for (int i=0;i<size;i++) out<<std::hex<<std::setw(2)<<std::setfill('0')<<int(data[i]); return out.str();
}
std::string randomHex(int bytes) {
    std::vector<unsigned char> data(bytes); if (RAND_bytes(data.data(),bytes)!=1) throw Error(500,"Unable to generate secure random bytes."); return hex(data.data(),bytes);
}
static std::string derive(const std::string& password, const std::string& salt, int rounds) {
    unsigned char result[32]; if (PKCS5_PBKDF2_HMAC(password.data(),int(password.size()),reinterpret_cast<const unsigned char*>(salt.data()),int(salt.size()),rounds,EVP_sha256(),32,result)!=1) throw Error(500,"Password hashing failed."); return hex(result,32);
}
std::string passwordHash(const std::string& password) { auto salt=randomHex(16); return "pbkdf2-sha256$210000$"+salt+"$"+derive(password,salt,210000); }
bool passwordMatches(const std::string& password,const std::string& stored) {
    std::smatch m; if (!std::regex_match(stored,m,std::regex(R"(^pbkdf2-sha256\$([0-9]+)\$([a-f0-9]{32})\$([a-f0-9]{64})$)"))) return false;
    int rounds=std::stoi(m[1]); if (rounds<100000 || rounds>1000000) return false;
    auto expected=m[3].str(), actual=derive(password,m[2],rounds); return CRYPTO_memcmp(actual.data(),expected.data(),actual.size())==0;
}
static std::string base64(const std::string& data) {
    std::string result(4*((data.size()+2)/3),'\0'); int count=EVP_EncodeBlock(reinterpret_cast<unsigned char*>(&result[0]),reinterpret_cast<const unsigned char*>(data.data()),int(data.size())); result.resize(count);
    for (auto& c:result) { if(c=='+')c='-'; else if(c=='/')c='_'; } while (!result.empty() && result.back()=='=')result.pop_back(); return result;
}
static std::string unbase64(std::string data) {
    if (!std::regex_match(data,std::regex("[A-Za-z0-9_-]+"))) throw Error(401,"Invalid token.");
    for(auto& c:data){if(c=='-')c='+';else if(c=='_')c='/';} while(data.size()%4)data+='=';
    std::string result(data.size(),'\0'); int n=EVP_DecodeBlock(reinterpret_cast<unsigned char*>(&result[0]),reinterpret_cast<const unsigned char*>(data.data()),int(data.size()));
    if(n<0)throw Error(401,"Invalid token."); if(data.back()=='=')n--; if(data.size()>1 && data[data.size()-2]=='=')n--;result.resize(n);return result;
}
static std::string signature(const std::string& data,const std::string& secret) {
    unsigned char bytes[EVP_MAX_MD_SIZE];unsigned length=0;
    if(!HMAC(EVP_sha256(),secret.data(),int(secret.size()),reinterpret_cast<const unsigned char*>(data.data()),data.size(),bytes,&length))throw Error(500,"Token signing failed.");
    return base64(std::string(reinterpret_cast<char*>(bytes),length));
}
std::string issueToken(const Json& user,const std::string& secret) {
    auto now=std::time(nullptr);Json payload={{"user_id",user["user_id"]},{"iat",now},{"exp",now+7*86400},{"iss","moveit-cpp"}};
    auto data=base64(Json({{"alg","HS256"},{"typ","JWT"}}).dump())+"."+base64(payload.dump()); return data+"."+signature(data,secret);
}
int verifyToken(const std::string& token,const std::string& secret) {
    try {
        auto first=token.find('.'),last=token.rfind('.');if(first==std::string::npos || first==last)throw Error(401,"Invalid token.");
        auto supplied=token.substr(last+1),expected=signature(token.substr(0,last),secret);
        if(supplied.size()!=expected.size() || CRYPTO_memcmp(supplied.data(),expected.data(),expected.size()))throw Error(401,"Invalid token.");
        auto header=Json::parse(unbase64(token.substr(0,first)));auto body=Json::parse(unbase64(token.substr(first+1,last-first-1)));
        if(field(header,"alg")!="HS256" || field(body,"iss")!="moveit-cpp" || !body.contains("exp") || !body["exp"].is_number_integer() || body["exp"].get<long long>()<=std::time(nullptr))throw Error(401,"Your session has expired. Please sign in again.");
        int id=integer(body,"user_id");if(id<1)throw Error(401,"Invalid token.");return id;
    } catch(const Error&){throw;}catch(...){throw Error(401,"Invalid token.");}
}
}
