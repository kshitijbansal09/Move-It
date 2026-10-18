#include "self_tests.hpp"
#include "booking_service.hpp"

int runTests() {
    int failed = 0;
    auto check = [&](bool ok, const string& what) { std::cout << (ok ? "  PASS  " : "  FAIL  ") << what << "\n"; if (!ok) failed++; };

    check(sha::sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 known-answer test");
    check(distanceKm(30.0, 77.0, 30.0, 77.0) == 0.0, "Haversine: identical points = 0 km");
    double gc = distanceKm(30.2675, 77.9959, 30.3256, 78.0437);
    check(gc > 7.0 && gc < 9.0, "Haversine: Campus -> Clock Tower ~ 8 km (got " + std::to_string(gc) + ")");
    check(std::fabs(distanceKm(0, 0, 0, 1) - 111.19) < 0.05, "Haversine: 1 degree longitude at equator ~ 111.19 km");

    vector<Request> reqs = {{101, 1, "normal", 1500, "A"}, {102, 2, "urgent", 1520, "B"}, {103, 3, "normal", 1400, "C"}, {104, 4, "urgent", 1300, "D"}};
    auto f = sortFCFS(reqs), p = sortPriority(reqs);
    check(f[0].bookingId == 104 && f[1].bookingId == 103 && f[2].bookingId == 101 && f[3].bookingId == 102, "FCFS order 104,103,101,102");
    check(p[0].bookingId == 104 && p[1].bookingId == 102 && p[2].bookingId == 103 && p[3].bookingId == 101, "Priority order 104,102,103,101");
    Allocation al = allocateSeats(10, 8, reqs, "priority");
    check(al.available == 2 && al.assigned.size() == 2 && al.waitlisted.size() == 2, "Allocation: 2 free seats -> 2 assigned, 2 waitlisted");

    Database db; db.seed();
    Trip* t4 = db.trip(4);  // 8-seat van
    for (int i = 0; i < 8; ++i) db.addUser("U" + std::to_string(i), "u" + std::to_string(i) + "@x.in", "pw", "student", 0, "+910000000000");
    int filled = 0, rejected = 0;
    for (int uid = 7; uid <= 14; ++uid) { try { db.insertBooking(uid, 4, "normal", "confirmed"); filled++; } catch (const ConflictError&) { rejected++; } }
    check(filled == 8 && t4->seatsFilled == 8, "Trigger: 8-seat van fills to exactly 8");
    bool blocked = false; try { db.insertBooking(2, 4, "normal", "confirmed"); } catch (const ConflictError&) { blocked = true; }
    check(blocked && t4->seatsFilled == 8, "Trigger: 9th booking rejected (overbooking prevented)");
    bool dup = false; try { db.insertBooking(7, 4, "normal", "confirmed"); } catch (const ConflictError&) { dup = true; }
    check(dup, "UNIQUE(user, trip): duplicate booking rejected");
    int firstBooking = 0; for (auto& b : db.bookings) if (b.tripId == 4) { firstBooking = b.id; break; }
    db.setBookingStatus(firstBooking, "cancelled");
    check(t4->seatsFilled == 7, "Trigger: cancelling a confirmed booking frees a seat");
    int pend = db.insertBooking(2, 4, "urgent", "pending");
    db.setBookingStatus(pend, "confirmed");
    check(t4->seatsFilled == 8, "Trigger: pending -> confirmed claims the seat");

    Notifier n(db); BookingService svc(db, n);
    check(svc.evaluateDemand(2) == 2, "Demand: 2 active bookings toward Clock Tower");
    check(!svc.nearbyStations(1, 15.0).empty(), "Nearby stations within 15 km of campus");
    User* a = db.userByEmail("admin@geu.ac.in");
    check(a && hashPassword("Password@123", a->salt) == a->hash && hashPassword("wrong", a->salt) != a->hash, "Password hashing / verification");

    std::cout << (failed ? "\nSOME TESTS FAILED\n" : "\nALL TESTS PASSED\n");
    return failed ? 1 : 0;
}
