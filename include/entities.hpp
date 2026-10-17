#pragma once

#include "common.hpp"

struct Station { int id; string name; double lat, lon; };
struct User { int id; string name, email, salt, hash, role; int stationId; string phone; };
struct Driver { int id; string name, license, phone; };
struct Vehicle { int id; string reg; int capacity; string status; };
struct Route { int id; string name; int startId, endId; };
struct Trip { int id, vehicleId, routeId, driverId; time_t departure; int seatsFilled; string status; };
struct Booking { int id, userId, tripId; string priority, status; time_t bookingTime; };
struct Notification { int id, userId; string message, sid, status; time_t sentAt; };

struct ConflictError : std::runtime_error {  // mirrors SQLSTATE 45000 -> HTTP 409
    using std::runtime_error::runtime_error;
};
