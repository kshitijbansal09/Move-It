#include "booking_service.hpp"

BookingService::BookingService(Database& d, Notifier& n) : db(d), notify(n) {}

vector<NearbyStation> BookingService::nearbyStations(int stationId, double radius) {
        Station* o = db.station(stationId);
        if (!o) throw std::runtime_error("Station with ID " + std::to_string(stationId) + " not found.");
        vector<NearbyStation> out;
        for (auto& s : db.stations) {
            if (s.id == stationId) continue;
            double d = distanceKm(o->lat, o->lon, s.lat, s.lon);
            if (d <= radius) out.push_back({s.id, s.name, d});
        }
        std::sort(out.begin(), out.end(), [](const NearbyStation& a, const NearbyStation& b) { return a.km < b.km; });
        return out;
    }

int BookingService::evaluateDemand(int destStationId) {
        time_t cutoff = std::time(nullptr) - DEMAND_WINDOW_MINUTES * 60;
        int n = 0;
        for (auto& b : db.bookings) {
            Trip* t = db.trip(b.tripId);
            Route* r = t ? db.route(t->routeId) : nullptr;
            if (r && r->endId == destStationId && b.bookingTime >= cutoff && (b.status == "pending" || b.status == "confirmed")) n++;
        }
        return n;
    }

int BookingService::bookSpecificTrip(int userId, int tripId, const string& priority) {
        User* u = db.user(userId);
        if (!u) throw std::runtime_error("User does not exist.");
        Trip* t = db.trip(tripId);
        if (!t) throw std::runtime_error("Trip #" + std::to_string(tripId) + " does not exist.");
        if (t->status != "scheduled")
            throw std::runtime_error("Cannot book Trip #" + std::to_string(tripId) + " because its status is '" + t->status + "'.");
        int id = db.insertBooking(userId, tripId, priority, "confirmed");  // may throw ConflictError
        notify.bookingConfirmed(*u, *t, *db.route(t->routeId), *db.vehicle(t->vehicleId), *db.driver(t->driverId));
        return id;
    }

vector<Trip*> BookingService::directTrips(int destStationId) {
        vector<Trip*> v;
        time_t now = std::time(nullptr);
        for (auto& t : db.trips) {
            Route* r = db.route(t.routeId);
            if (r && r->endId == destStationId && t.status == "scheduled" && t.departure >= now) v.push_back(&t);
        }
        std::sort(v.begin(), v.end(), [](Trip* a, Trip* b) { return a->departure < b->departure; });
        if (v.size() > 5) v.resize(5);
        return v;
    }

void BookingService::processRideRequest(int userId, int destId, const string& requestedTime, const string& priority) {
        User* u = db.user(userId);
        Station* dest = db.station(destId);
        if (!u) throw std::runtime_error("User does not exist.");
        if (!dest) throw std::runtime_error("Destination station ID #" + std::to_string(destId) + " does not exist.");

        notify.requestReceived(*u, dest->name, requestedTime.empty() ? "Next scheduled slot" : requestedTime, priority);

        int demand = evaluateDemand(destId);
        std::cout << "\n  [Demand analysis] '" << dest->name << "' demand = " << demand << " (threshold " << DEMAND_THRESHOLD << ")\n";
        vector<Trip*> direct = directTrips(destId);

        if (demand >= DEMAND_THRESHOLD && !direct.empty()) {  // HIGH demand: allocate the soonest trip
            try {
                int bid = bookSpecificTrip(userId, direct[0]->id, priority);
                std::cout << "  Result: HIGH demand -> DIRECT_TRIP_ALLOCATED (booking #" << bid << ", trip #" << direct[0]->id << ")\n";
                return;
            } catch (const std::exception& e) { std::cout << "  [Allocation notice] " << e.what() << "\n"; }
        }
        for (Trip* t : direct) {  // any direct trip with a free seat
            if (t->seatsFilled < db.capacityOf(*t)) {
                try {
                    int bid = bookSpecificTrip(userId, t->id, priority);
                    std::cout << "  Result: " << (demand >= DEMAND_THRESHOLD ? "HIGH" : "MODERATE")
                              << " demand -> DIRECT_TRIP_ALLOCATED (booking #" << bid << ", trip #" << t->id << ")\n";
                    return;
                } catch (const std::exception& e) { std::cout << "  [Direct booking error] " << e.what() << "\n"; }
                break;
            }
        }

        // LOW demand or no seat: Haversine alternatives
        auto nearby = nearbyStations(destId, NEARBY_RADIUS_KM);
        string altName, altDep; double altKm = 0; int altTrip = 0, altSeats = 0;
        time_t now = std::time(nullptr);
        vector<Trip*> alts;
        for (auto& t : db.trips) {
            Route* r = db.route(t.routeId);
            if (!r || t.status != "scheduled" || t.departure < now || t.departure > now + 2 * 3600) continue;
            if (t.seatsFilled >= db.capacityOf(t)) continue;
            for (auto& n : nearby)
                if (n.id == r->endId || n.id == r->startId) { alts.push_back(&t); break; }
        }
        std::sort(alts.begin(), alts.end(), [](Trip* a, Trip* b) { return a->departure < b->departure; });
        if (!alts.empty()) {
            Trip* c = alts[0]; Route* r = db.route(c->routeId);
            const NearbyStation* meta = &nearby[0];
            for (auto& n : nearby) if (n.id == r->endId) { meta = &n; break; }
            altName = meta->name; altKm = meta->km; altTrip = c->id;
            altSeats = db.capacityOf(*c) - c->seatsFilled; altDep = fmtTime(c->departure, "%H:%M");
        }
        notify.waitOrAlternative(*u, dest->name, 45, altName, altKm, altDep);
        std::cout << "  Result: LOW demand -> ALTERNATIVE_SUGGESTED. Estimated wait: 45 min\n  Nearest stations:\n";
        for (size_t i = 0; i < nearby.size() && i < 3; ++i)
            std::cout << "    - " << nearby[i].name << " (" << std::fixed << std::setprecision(2) << nearby[i].km << " km)\n";
        if (altTrip) std::cout << "  Suggested trip #" << altTrip << " toward " << altName << " at " << altDep << " (" << altSeats << " seats free)\n";
    }

void BookingService::scheduleBatch(int tripId, const string& policy) {
        Trip* t = db.trip(tripId);
        if (!t) throw std::runtime_error("Trip with ID " + std::to_string(tripId) + " not found.");
        vector<Request> pending;
        for (auto& b : db.bookings)
            if (b.tripId == tripId && b.status == "pending") pending.push_back({b.id, b.userId, b.priority, b.bookingTime, db.user(b.userId)->name});
        if (pending.empty()) { std::cout << "  No pending bookings found for this trip to schedule.\n"; return; }
        Allocation a = allocateSeats(db.capacityOf(*t), t->seatsFilled, pending, policy);
        std::cout << "  Policy: " << (policy == "fcfs" ? "FCFS" : "PRIORITY") << " | capacity " << a.capacity
                  << ", filled " << a.seatsFilled << ", available " << a.available << "\n";
        for (auto& r : a.assigned) {
            try {
                db.setBookingStatus(r.bookingId, "confirmed");
                std::cout << "   #" << r.queuePos << " booking " << r.bookingId << " (" << r.userName << ", " << r.priority << ") -> CONFIRMED\n";
            } catch (const ConflictError& e) { std::cout << "   booking " << r.bookingId << " -> conflict: " << e.what() << "\n"; }
        }
        for (auto& r : a.waitlisted)
            std::cout << "   #" << r.queuePos << " booking " << r.bookingId << " (" << r.userName << ", " << r.priority << ") -> WAITLISTED\n";
    }
