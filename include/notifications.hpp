#pragma once

#include "database.hpp"
#include "utils.hpp"

class Notifier {
    Database& db;
public:
    explicit Notifier(Database& d);
    void send(const User& u, const string& body);
    void requestReceived(const User& u, const string& dest, const string& when, const string& prio);
    void waitOrAlternative(const User& u, const string& dest, int waitMin, const string& altName, double altKm, const string& altDep);
    void bookingConfirmed(const User& u, const Trip& t, const Route& r, const Vehicle& v, const Driver& d);
};
