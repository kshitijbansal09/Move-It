#include "application.hpp"

bool App::isAdmin() const { return me && me->role == "admin"; }

void App::listStations() {
        rule();
        for (auto& s : db.stations)
            std::cout << std::setw(3) << s.id << "  " << std::left << std::setw(34) << s.name << std::right
                      << std::fixed << std::setprecision(4) << s.lat << ", " << s.lon << "\n";
        rule();
    }

void App::listTrips() {
        rule();
        for (auto& t : db.trips) {
            Route* r = db.route(t.routeId); Vehicle* v = db.vehicle(t.vehicleId); Driver* d = db.driver(t.driverId);
            std::cout << "Trip #" << t.id << " [" << t.status << "] " << fmtTime(t.departure) << "\n   "
                      << (r ? r->name : "?") << " | " << (v ? v->reg : "?") << " | driver " << (d ? d->name : "?")
                      << " | seats " << t.seatsFilled << "/" << db.capacityOf(t) << "\n";
        }
        rule();
    }

void App::printBooking(const Booking& b, bool showUser) {
        Trip* t = db.trip(b.tripId); Route* r = t ? db.route(t->routeId) : nullptr;
        std::cout << "Booking #" << b.id << " | trip #" << b.tripId << " " << (r ? r->name : "?")
                  << " | " << b.priority << " | " << b.status << " | " << fmtTime(b.bookingTime, "%d %b %H:%M");
        if (showUser) std::cout << " | " << db.user(b.userId)->name;
        std::cout << "\n";
    }

void App::myBookings() {
        rule(); int n = 0;
        for (auto& b : db.bookings) if (b.userId == me->id) { printBooking(b, false); n++; }
        if (!n) std::cout << "No bookings yet.\n";
        rule();
    }

void App::allBookings() {
        rule();
        for (auto& b : db.bookings) printBooking(b, true);
        if (db.bookings.empty()) std::cout << "No bookings.\n";
        rule();
    }

void App::showNotifications(bool all) {
        rule(); int n = 0;
        for (auto& x : db.notifications) {
            if (!all && x.userId != me->id) continue;
            std::cout << "#" << x.id << " " << fmtTime(x.sentAt, "%d %b %H:%M") << " user " << x.userId << " [" << x.status << "] "
                      << x.message.substr(0, x.message.find('\n')) << "\n"; n++;
        }
        if (!n) std::cout << "No notifications.\n";
        rule();
    }

string App::pickPriority() { return lower(readLine("Priority (normal/urgent) [normal]: ")) == "urgent" ? "urgent" : "normal"; }

void App::nearby() {
        listStations();
        int id = readInt("Station ID: ");
        double r = readDouble("Radius km [15]: ", 15);
        auto v = svc.nearbyStations(id, r > 0 ? r : 15);
        for (auto& n : v) std::cout << "  " << std::left << std::setw(34) << n.name << std::right << std::fixed << std::setprecision(2) << n.km << " km\n";
        if (v.empty()) std::cout << "  No stations within radius.\n";
    }

void App::requestRide() {
        listStations();
        int dest = readInt("Destination station ID: ");
        string when = readLine("Preferred time (optional): ");
        svc.processRideRequest(me->id, dest, when, pickPriority());
    }

void App::bookTrip() {
        listTrips();
        int id = readInt("Trip ID: ");
        int bid = svc.bookSpecificTrip(me->id, id, pickPriority());
        std::cout << "  Booking #" << bid << " confirmed.\n";
    }

void App::cancelBooking() {
        myBookingsOrAll();
        int id = readInt("Booking ID to cancel: ");
        Booking* b = db.booking(id);
        if (!b) throw std::runtime_error("Booking #" + std::to_string(id) + " not found.");
        if (!isAdmin() && b->userId != me->id) throw std::runtime_error("Access denied. You can only cancel your own bookings.");
        if (b->status == "cancelled") throw std::runtime_error("This booking has already been cancelled.");
        db.setBookingStatus(id, "cancelled");
        std::cout << "  Booking cancelled. Seat released.\n";
    }

void App::myBookingsOrAll() { if (isAdmin()) allBookings(); else myBookings(); }

void App::updateStatus() {
        allBookings();
        int id = readInt("Booking ID: ");
        string s = lower(readLine("New status (confirmed/pending/rejected/cancelled): "));
        if (s != "confirmed" && s != "pending" && s != "rejected" && s != "cancelled")
            throw std::runtime_error("Invalid status. Must be one of: confirmed, pending, rejected, cancelled");
        db.setBookingStatus(id, s);
        std::cout << "  Status updated.\n";
    }

void App::deleteBooking() { allBookings(); db.deleteBooking(readInt("Booking ID to delete: ")); std::cout << "  Deleted.\n"; }

void App::batch() {
        listTrips();
        int id = readInt("Trip ID: ");
        string p = lower(readLine("Policy (priority/fcfs) [priority]: "));
        svc.scheduleBatch(id, p == "fcfs" ? "fcfs" : "priority");
    }

void App::createPending() {  // demo helper so the batch scheduler has requests to work on
        listTrips();
        int tid = readInt("Trip ID: ");
        for (auto& u : db.users) std::cout << "  user " << u.id << ": " << u.name << " (" << u.role << ")\n";
        int uid = readInt("User ID: ");
        if (!db.user(uid)) throw std::runtime_error("User does not exist.");
        int id = db.insertBooking(uid, tid, pickPriority(), "pending");
        std::cout << "  Pending booking #" << id << " created.\n";
    }

void App::manage() {
        std::cout << "1 Stations  2 Vehicles  3 Drivers  4 Routes  5 Trips\n";
        int e = readInt("Entity: ");
        std::cout << "1 List  2 Add  3 Delete\n";
        int a = readInt("Action: ");
        if (a == 1) {
            rule();
            switch (e) {
                case 1: for (auto& x : db.stations) std::cout << x.id << ": " << x.name << "\n"; break;
                case 2: for (auto& x : db.vehicles) std::cout << x.id << ": " << x.reg << " cap " << x.capacity << " [" << x.status << "]\n"; break;
                case 3: for (auto& x : db.drivers) std::cout << x.id << ": " << x.name << " " << x.license << " " << x.phone << "\n"; break;
                case 4: for (auto& x : db.routes) std::cout << x.id << ": " << x.name << " (" << x.startId << " -> " << x.endId << ")\n"; break;
                case 5: listTrips(); return;
                default: std::cout << "Unknown entity.\n";
            }
            rule();
        } else if (a == 2) {
            if (e == 1) {
                string n = readLine("Name: "); double la = readDouble("Latitude: "), lo = readDouble("Longitude: ");
                if (n.empty() || la < -90 || la > 90 || lo < -180 || lo > 180) throw std::runtime_error("Invalid station data.");
                std::cout << "  Station #" << db.addStation(n, la, lo) << " created.\n";
            } else if (e == 2) {
                string r = readLine("Registration no.: "); int c = readInt("Capacity: ");
                string s = lower(readLine("Status (active/maintenance/inactive) [active]: ")); if (s.empty()) s = "active";
                if (r.empty() || c <= 0 || (s != "active" && s != "maintenance" && s != "inactive")) throw std::runtime_error("Invalid vehicle data.");
                for (auto& v : db.vehicles) if (v.reg == r) throw ConflictError("A vehicle with this registration already exists.");
                std::cout << "  Vehicle #" << db.addVehicle(r, c, s) << " created.\n";
            } else if (e == 3) {
                string n = readLine("Name: "), l = readLine("License no.: "), p = readLine("Phone: ");
                if (n.empty() || l.empty() || p.empty()) throw std::runtime_error("All fields are required.");
                for (auto& d : db.drivers) if (d.license == l) throw ConflictError("A driver with this license already exists.");
                std::cout << "  Driver #" << db.addDriver(n, l, p) << " created.\n";
            } else if (e == 4) {
                listStations();
                string n = readLine("Route name: "); int s = readInt("Start station ID: "), en = readInt("End station ID: ");
                if (n.empty() || !db.station(s) || !db.station(en)) throw std::runtime_error("Invalid route data (check station IDs).");
                std::cout << "  Route #" << db.addRoute(n, s, en) << " created.\n";
            } else if (e == 5) {
                int v = readInt("Vehicle ID: "), r = readInt("Route ID: "), d = readInt("Driver ID: "), m = readInt("Departure in how many minutes? ");
                if (!db.vehicle(v) || !db.route(r) || !db.driver(d) || m < 0) throw std::runtime_error("Invalid trip data (check IDs).");
                std::cout << "  Trip #" << db.addTrip(v, r, d, std::time(nullptr) + m * 60) << " scheduled.\n";
            }
        } else if (a == 3) {
            int id = readInt("ID to delete: ");
            const string refused = "Foreign key constraint violated: record is still in use.";
            if (e == 1) {
                if (!db.station(id)) throw std::runtime_error("Not found.");
                for (auto& r : db.routes) if (r.startId == id || r.endId == id) throw std::runtime_error(refused);
                for (auto& u : db.users) if (u.stationId == id) u.stationId = 0;
                db.stations.erase(std::remove_if(db.stations.begin(), db.stations.end(), [&](const Station& x) { return x.id == id; }), db.stations.end());
            } else if (e == 2) {
                if (!db.vehicle(id)) throw std::runtime_error("Not found.");
                for (auto& t : db.trips) if (t.vehicleId == id) throw std::runtime_error(refused);
                db.vehicles.erase(std::remove_if(db.vehicles.begin(), db.vehicles.end(), [&](const Vehicle& x) { return x.id == id; }), db.vehicles.end());
            } else if (e == 3) {
                if (!db.driver(id)) throw std::runtime_error("Not found.");
                for (auto& t : db.trips) if (t.driverId == id) throw std::runtime_error(refused);
                db.drivers.erase(std::remove_if(db.drivers.begin(), db.drivers.end(), [&](const Driver& x) { return x.id == id; }), db.drivers.end());
            } else if (e == 4) {
                if (!db.route(id)) throw std::runtime_error("Not found.");
                for (auto& t : db.trips) if (t.routeId == id) throw std::runtime_error(refused);
                db.routes.erase(std::remove_if(db.routes.begin(), db.routes.end(), [&](const Route& x) { return x.id == id; }), db.routes.end());
            } else if (e == 5) {
                if (!db.trip(id)) throw std::runtime_error("Not found.");
                db.bookings.erase(std::remove_if(db.bookings.begin(), db.bookings.end(), [&](const Booking& b) { return b.tripId == id; }), db.bookings.end());  // ON DELETE CASCADE
                db.trips.erase(std::remove_if(db.trips.begin(), db.trips.end(), [&](const Trip& x) { return x.id == id; }), db.trips.end());
            } else throw std::runtime_error("Unknown entity.");
            std::cout << "  Deleted.\n";
        }
    }

bool App::login() {
        string email = readLine("Email: "), pw = readLine("Password: ");
        User* u = db.userByEmail(email);
        if (!u || hashPassword(pw, u->salt) != u->hash) { std::cout << "  Invalid email or password.\n"; return false; }
        me = u;
        std::cout << "\n  Welcome, " << u->name << " (" << u->role << ")\n";
        return true;
    }

void App::signup() {
        string name = readLine("Full name: "), email = lower(readLine("Email: ")), pw = readLine("Password: "), phone = readLine("Phone (10 digits or +country): ");
        string role = lower(readLine("Role (student/faculty) [student]: ")); if (role.empty()) role = "student";
        if (name.empty() || email.empty() || pw.empty() || phone.empty()) { std::cout << "  Name, email, password and phone are required.\n"; return; }
        if (role != "student" && role != "faculty") { std::cout << "  Role must be student or faculty (admins are created by an existing admin).\n"; return; }
        if (db.userByEmail(email)) { std::cout << "  A user with this email already exists.\n"; return; }
        string digits; for (char c : phone) if (std::isdigit(static_cast<unsigned char>(c))) digits += c;
        phone = phone[0] == '+' ? "+" + digits : (digits.size() == 10 ? "+91" + digits : "+" + digits);
        db.addUser(name, email, pw, role, 0, phone);
        std::cout << "  Account created. You can now log in.\n";
    }

void App::userMenu() {
        for (;;) {
            std::cout << "\n=== Move It | " << me->name << " (" << me->role << ") ===\n"
                      << " 1 List stations      2 Nearby stations (Haversine)   3 List trips\n"
                      << " 4 Request a ride     5 Book a trip directly          6 My bookings\n"
                      << " 7 Cancel a booking   8 My WhatsApp notifications\n";
            if (isAdmin())
                std::cout << " 9 All bookings      10 Update booking status       11 Delete booking\n"
                          << "12 Batch scheduling  13 Add pending request (demo)  14 Manage stations/fleet/routes/trips\n"
                          << "15 All notifications\n";
            std::cout << " 0 Logout\n";
            int c = readInt("Choice: ");
            if (gEof) return;
            try {
                if (c == 0) { me = nullptr; return; }
                else if (c == 1) listStations();
                else if (c == 2) nearby();
                else if (c == 3) listTrips();
                else if (c == 4) requestRide();
                else if (c == 5) bookTrip();
                else if (c == 6) myBookings();
                else if (c == 7) cancelBooking();
                else if (c == 8) showNotifications(false);
                else if (isAdmin() && c == 9) allBookings();
                else if (isAdmin() && c == 10) updateStatus();
                else if (isAdmin() && c == 11) deleteBooking();
                else if (isAdmin() && c == 12) batch();
                else if (isAdmin() && c == 13) createPending();
                else if (isAdmin() && c == 14) manage();
                else if (isAdmin() && c == 15) showNotifications(true);
                else std::cout << "  Invalid choice.\n";
            } catch (const ConflictError& e) { std::cout << "  CONFLICT: " << e.what() << "\n"; }
            catch (const std::exception& e) { std::cout << "  Error: " << e.what() << "\n"; }
        }
    }

App::App() { db.seed(); }

void App::run() {
        std::cout << "==============================================\n  Move It - College Transit Management (C++)\n==============================================\n"
                  << "Demo accounts (password Password@123): admin@geu.ac.in, rahul.student@geu.ac.in\n";
        for (;;) {
            std::cout << "\n1 Login   2 Sign up   0 Exit\n";
            int c = readInt("Choice: ");
            if (gEof || c == 0) break;
            if (c == 1 && login()) userMenu();
            else if (c == 2) signup();
            if (gEof) break;
        }
        std::cout << "Goodbye.\n";
    }
