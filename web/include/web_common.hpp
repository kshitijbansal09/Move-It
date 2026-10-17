#pragma once
#include "json.hpp"
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <memory>
#include <regex>
#include <stdexcept>
#include <string>
#include <vector>
namespace web {
using Json = nlohmann::json;
struct Error : std::runtime_error {
    int status;
    Error(int code, const std::string& message) : std::runtime_error(message), status(code) {}
};
struct Config {
    std::string host = "127.0.0.1", dbHost = "localhost", dbUser = "root", dbPassword, dbName = "moveit_cpp", dbSocket;
    std::string jwtSecret, staticDir = "frontend/dist", schemaFile = "sql/schema.sql";
    unsigned port = 5002, dbPort = 3306;
    int lowDemandThreshold = 5;
    static Config load();
};
std::string text(const Json& value);
std::string field(const Json& object, const std::string& key, const std::string& fallback = "");
int integer(const Json& object, const std::string& key, int fallback = 0);
std::string campusDate(std::time_t now = std::time(nullptr));
std::string validateDate(const std::string& value);
std::string normalizeTime(const std::string& value);
std::time_t campusTimestamp(const std::string& value);
std::string offsetTime(const std::string& value);
Json assignSlot(const std::string& value, const Json& slots);
std::string randomHex(int bytes);
std::string passwordHash(const std::string& password);
bool passwordMatches(const std::string& password, const std::string& stored);
std::string issueToken(const Json& user, const std::string& secret);
int verifyToken(const std::string& token, const std::string& secret);
}
