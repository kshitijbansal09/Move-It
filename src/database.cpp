#include "database.hpp"

Station* Database::station(int id) { return find(stations, id); }

User* Database::user(int id) { return find(users, id); }

Driver* Database::driver(int id) { return find(drivers, id); }

Vehicle* Database::vehicle(int id) { return find(vehicles, id); }

Route* Database::route(int id) { return find(routes, id); }

Trip* Database::trip(int id) { return find(trips, id); }

Booking* Database::booking(int id) { return find(bookings, id); }

User* Database::userByEmail(const string& e) {
        for (auto& u : users) if (u.email == lower(e)) return &u;
        return nullptr;
    }

int Database::capacityOf(const Trip& t) { Vehicle* v = vehicle(t.vehicleId); return v ? v->capacity : 0; }

int Database::addStation(string n, double la, double lo) { stations.push_back({nStation, n, la, lo}); return nStation++; }

int Database::addUser(string n, string e, const string& pw, string role, int st, string ph) {
        string salt = makeSalt();
        users.push_back({nUser, n, lower(e), salt, hashPassword(pw, salt), role, st, ph});
        return nUser++;
    }

int Database::addDriver(string n, string l, string p) { drivers.push_back({nDriver, n, l, p}); return nDriver++; }

int Database::addVehicle(string r, int c, string s) { vehicles.push_back({nVehicle, r, c, s}); return nVehicle++; }

int Database::addRoute(string n, int s, int e) { routes.push_back({nRoute, n, s, e}); return nRoute++; }

int Database::addTrip(int v, int r, int d, time_t dep) { trips.push_back({nTrip, v, r, d, dep, 0, "scheduled"}); return nTrip++; }

int Database::insertBooking(int userId, int tripId, const string& priority, const string& status) {
        Trip* t = trip(tripId);
        if (!t) throw std::runtime_error("Trip #" + std::to_string(tripId) + " does not exist.");
        for (auto& b : bookings)
            if (b.userId == userId && b.tripId == tripId)  // UNIQUE (user_id, trip_id)
                throw ConflictError("You already have an existing reservation for this trip.");
        // TRIGGER before_booking_insert
        if (status != "rejected" && status != "cancelled" && t->seatsFilled >= capacityOf(*t))
            throw ConflictError("Trip is fully booked - conflict detected");
        bookings.push_back({nBooking, userId, tripId, priority, status, std::time(nullptr)});
        // TRIGGER after_booking_insert
        if (status == "confirmed") t->seatsFilled++;
        return nBooking++;
    }

void Database::setBookingStatus(int id, const string& next) {
        Booking* b = booking(id);
        if (!b) throw std::runtime_error("Booking #" + std::to_string(id) + " not found.");
        Trip* t = trip(b->tripId);
        string old = b->status;
        // TRIGGER before_booking_update
        if (old != "confirmed" && next == "confirmed" && t && t->seatsFilled >= capacityOf(*t))
            throw ConflictError("Trip is fully booked - conflict detected");
        b->status = next;
        // TRIGGER after_booking_update
        if (t) {
            if (old == "confirmed" && (next == "cancelled" || next == "rejected")) t->seatsFilled = std::max(0, t->seatsFilled - 1);
            else if (old != "confirmed" && next == "confirmed") t->seatsFilled++;
        }
    }

void Database::deleteBooking(int id) {
        Booking* b = booking(id);
        if (!b) throw std::runtime_error("Booking #" + std::to_string(id) + " not found.");
        // (the MySQL version has no DELETE trigger, which leaves seats_filled stale; fixed here)
        if (b->status == "confirmed") { if (Trip* t = trip(b->tripId)) t->seatsFilled = std::max(0, t->seatsFilled - 1); }
        bookings.erase(std::remove_if(bookings.begin(), bookings.end(), [&](const Booking& x) { return x.id == id; }), bookings.end());
    }

void Database::seed() {
        addStation("Graphic Era University (Campus)", 30.2675, 77.9959);
        addStation("Clock Tower", 30.3256, 78.0437);
        addStation("Prem Nagar", 30.3326, 77.9583);
        addStation("Mothrowala", 30.2630, 78.0323);
        addStation("ONGC Chowk", 30.3409, 78.0190);
        addStation("Doiwala", 30.1798, 78.1232);
        addStation("Jolly Grant Airport", 30.1967, 78.0877);
        addStation("Vikasnagar", 30.4680, 77.7740);
        addStation("Rishikesh", 30.1078, 78.2925);
        const string pw = "Password@123";
        addUser("Dr. Rajesh Sharma (Transport Admin)", "admin@geu.ac.in", pw, "admin", 1, "+919876543210");
        addUser("Prof. Sunita Verma", "sunita.verma@geu.ac.in", pw, "faculty", 2, "+919876543211");
        addUser("Dr. Amit Negi", "amit.negi@geu.ac.in", pw, "faculty", 5, "+919876543212");
        addUser("Rahul Joshi", "rahul.student@geu.ac.in", pw, "student", 3, "+919876543213");
        addUser("Priya Chauhan", "priya.student@geu.ac.in", pw, "student", 6, "+919876543214");
        addUser("Aman Rawat", "aman.student@geu.ac.in", pw, "student", 8, "+919876543215");
        addDriver("Ramesh Chand", "UK07-2019-0012345", "+919811122334");
        addDriver("Gurpreet Singh", "UK07-2020-0067890", "+919822233445");
        addDriver("Mohan Lal", "UK07-2018-0099887", "+919833344556");
        addVehicle("UK07-PA-1001 (Bus #1)", 40, "active");
        addVehicle("UK07-PB-2002 (Mini-Bus #2)", 25, "active");
        addVehicle("UK07-TA-3003 (Shuttle #3)", 14, "active");
        addVehicle("UK07-TB-4004 (Van #4)", 8, "active");
        addVehicle("UK07-PA-5005 (Bus #5)", 40, "maintenance");
        addRoute("GEU Campus <-> Clock Tower Express", 1, 2);
        addRoute("GEU Campus <-> Doiwala Corridor", 1, 6);
        addRoute("GEU Campus <-> Vikasnagar Route", 1, 8);
        addRoute("GEU Campus <-> Prem Nagar Local", 1, 3);
        time_t now = std::time(nullptr);
        addTrip(1, 1, 1, now + 1 * 3600);
        addTrip(2, 2, 2, now + 2 * 3600);
        addTrip(3, 3, 3, now + 3 * 3600);
        addTrip(4, 4, 1, now + 4 * 3600);
        insertBooking(4, 1, "normal", "confirmed");
        insertBooking(2, 1, "urgent", "confirmed");
        insertBooking(5, 2, "normal", "confirmed");
    }
