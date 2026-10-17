#include "notifications.hpp"

Notifier::Notifier(Database& d) : db(d) {}

void Notifier::send(const User& u, const string& body) {
        std::cout << "\n  [WhatsApp simulation] To " << u.phone << ":\n";
        std::istringstream is(body);
        for (string line; std::getline(is, line);) std::cout << "    | " << line << "\n";
        db.notifications.push_back({db.nNotif++, u.id, body, "SIMULATED_DEV_SID", "sent", std::time(nullptr)});
    }

void Notifier::requestReceived(const User& u, const string& dest, const string& when, const string& prio) {
        send(u, "*Move It Transportation Alert*\nHello " + u.name + ", your ride request has been received.\n"
                "Destination: " + dest + "\nRequested time: " + when + "\nPriority: " + prio +
                "\nOur scheduling engine is matching your request with active fleet routes.");
    }

void Notifier::waitOrAlternative(const User& u, const string& dest, int waitMin, const string& altName, double altKm, const string& altDep) {
        std::ostringstream os;
        os << "*Move It Transit Update*\nHello " << u.name << ", demand for " << dest << " is currently low.\n"
           << "Estimated wait time for dedicated trip: ~" << waitMin << " mins";
        if (!altName.empty())
            os << "\n\nSmart alternative: " << altName << " (" << std::fixed << std::setprecision(2) << altKm
               << " km away), next departure " << altDep << ".";
        send(u, os.str());
    }

void Notifier::bookingConfirmed(const User& u, const Trip& t, const Route& r, const Vehicle& v, const Driver& d) {
        send(u, "*Move It Seat Confirmed!*\nHello " + u.name + ", your seat is confirmed.\nTrip #" + std::to_string(t.id) +
                "\nRoute: " + r.name + "\nVehicle: " + v.reg + "\nDriver: " + d.name + " (" + d.phone + ")\nDeparture: " +
                fmtTime(t.departure) + "\nPlease arrive 5 minutes before departure.");
    }
