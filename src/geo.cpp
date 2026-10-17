#include "geo.hpp"

const double EARTH_RADIUS_KM = 6371.0;
const double PI = 3.14159265358979323846;
double toRadians(double d) { return d * PI / 180.0; }

double distanceKm(double lat1, double lon1, double lat2, double lon2) {
    double dLat = toRadians(lat2 - lat1), dLon = toRadians(lon2 - lon1);
    double a = std::sin(dLat / 2) * std::sin(dLat / 2) +
               std::cos(toRadians(lat1)) * std::cos(toRadians(lat2)) * std::sin(dLon / 2) * std::sin(dLon / 2);
    double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1 - a));
    return std::round(EARTH_RADIUS_KM * c * 100.0) / 100.0;
}
