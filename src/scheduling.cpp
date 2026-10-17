#include "scheduling.hpp"

vector<Request> sortFCFS(vector<Request> r) {
    std::stable_sort(r.begin(), r.end(), [](const Request& a, const Request& b) { return a.time < b.time; });
    return r;
}
vector<Request> sortPriority(vector<Request> r) {
    auto w = [](const Request& x) { return x.priority == "urgent" ? 2 : 1; };
    std::stable_sort(r.begin(), r.end(), [&](const Request& a, const Request& b) {
        if (w(a) != w(b)) return w(a) > w(b);
        return a.time < b.time;  // FCFS tie-breaker
    });
    return r;
}

Allocation allocateSeats(int capacity, int seatsFilled, const vector<Request>& reqs, const string& policy) {
    Allocation a{capacity, seatsFilled, std::max(0, capacity - seatsFilled), {}, {}};
    vector<Request> ordered = policy == "fcfs" ? sortFCFS(reqs) : sortPriority(reqs);
    for (size_t i = 0; i < ordered.size(); ++i) {
        ordered[i].queuePos = static_cast<int>(i) + 1;
        (static_cast<int>(i) < a.available ? a.assigned : a.waitlisted).push_back(ordered[i]);
    }
    return a;
}
