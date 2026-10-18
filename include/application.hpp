#pragma once

#include "booking_service.hpp"
#include "console.hpp"

class App {
    Database db;
    Notifier notifier{db};
    BookingService svc{db, notifier};
    User* me = nullptr;

    bool isAdmin() const;

    void listStations();
    void listTrips();
    void printBooking(const Booking& b, bool showUser);
    void myBookings();
    void allBookings();
    void showNotifications(bool all);
    string pickPriority();

    void nearby();
    void requestRide();
    void bookTrip();
    void cancelBooking();
    void myBookingsOrAll();

    void updateStatus();
    void deleteBooking();
    void batch();
    void createPending();

    // ---- admin CRUD (list / add / delete) ----
    void manage();

    // ---- auth ----
    bool login();
    void signup();

    void userMenu();

public:
    App();
    void run();
};
