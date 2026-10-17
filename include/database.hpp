#pragma once

#include "entities.hpp"
#include "security.hpp"
#include "utils.hpp"

class Database {
public:
    vector<Station> stations; vector<User> users; vector<Driver> drivers; vector<Vehicle> vehicles;
    vector<Route> routes; vector<Trip> trips; vector<Booking> bookings; vector<Notification> notifications;
    int nStation = 1, nUser = 1, nDriver = 1, nVehicle = 1, nRoute = 1, nTrip = 1, nBooking = 1, nNotif = 1;

    template <class T> static T* find(vector<T>& v, int id) {
        for (auto& x : v) if (x.id == id) return &x;
        return nullptr;
    }
    Station* station(int id);
    User* user(int id);
    Driver* driver(int id);
    Vehicle* vehicle(int id);
    Route* route(int id);
    Trip* trip(int id);
    Booking* booking(int id);
    User* userByEmail(const string& e);
    int capacityOf(const Trip& t);

    int addStation(string n, double la, double lo);
    int addUser(string n, string e, const string& pw, string role, int st, string ph);
    int addDriver(string n, string l, string p);
    int addVehicle(string r, int c, string s);
    int addRoute(string n, int s, int e);
    int addTrip(int v, int r, int d, time_t dep);

    // INSERT INTO BOOKING  (before_booking_insert + unique_user_trip + after_booking_insert)
    int insertBooking(int userId, int tripId, const string& priority, const string& status);

    // UPDATE BOOKING SET status = ?  (before_booking_update + after_booking_update)
    void setBookingStatus(int id, const string& next);

    void deleteBooking(int id);

    void seed();
};
