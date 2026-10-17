#pragma once

#include "common.hpp"

struct Request { int bookingId, userId; string priority; time_t time; string userName; int queuePos = 0; };
struct Allocation { int capacity, seatsFilled, available; vector<Request> assigned, waitlisted; };

vector<Request> sortFCFS(vector<Request> r);
vector<Request> sortPriority(vector<Request> r);
Allocation allocateSeats(int capacity, int seatsFilled, const vector<Request>& reqs, const string& policy);
