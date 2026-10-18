#pragma once

#include "database.hpp"
#include "notifications.hpp"
#include "geo.hpp"
#include "scheduling.hpp"

const int DEMAND_THRESHOLD = 5;
const int DEMAND_WINDOW_MINUTES = 45;
const double NEARBY_RADIUS_KM = 15.0;

struct NearbyStation { int id; string name; double km; };

class BookingService {
    Database& db;
    Notifier& notify;
public:
    BookingService(Database& d, Notifier& n);

    vector<NearbyStation> nearbyStations(int stationId, double radius);

    int evaluateDemand(int destStationId);

    int bookSpecificTrip(int userId, int tripId, const string& priority);

    // Trips ending at a station, scheduled, departing in the future, soonest first (max 5)
    vector<Trip*> directTrips(int destStationId);

    void processRideRequest(int userId, int destId, const string& requestedTime, const string& priority);

    // POST /api/trips/:id/schedule-batch
    void scheduleBatch(int tripId, const string& policy);
};
