#pragma once
#include "web_common.hpp"
#include <mysql.h>
namespace web {
class Sql {
    MYSQL* connection = nullptr;
    unsigned long long last = 0, changed = 0;
public:
    explicit Sql(const Config& config, bool selectDatabase = true);
    ~Sql();
    Sql(const Sql&) = delete;
    Sql& operator=(const Sql&) = delete;
    Json query(const std::string& sql, const std::vector<Json>& parameters = {});
    void raw(const std::string& sql);
    unsigned long long insertId() const { return last; }
    unsigned long long affected() const { return changed; }
};
class Transaction {
    Sql& sql; bool committed=false;
public:
    explicit Transaction(Sql& connection) : sql(connection) { sql.raw("START TRANSACTION"); }
    void commit() { sql.raw("COMMIT"); committed=true; }
    ~Transaction() { if(!committed) { try { sql.raw("ROLLBACK"); } catch(...) {} } }
};
void initializeSql(const Config& config);
void seedSchedule(Sql& sql);
}
