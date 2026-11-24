# Move It — modular C++ version

This folder separates the existing `../cpp/moveit.cpp` console application into cooperating C++17 modules. All original project files are retained. The original function bodies, seed data, menus, validation, algorithms and tests are preserved; the changes are file placement, includes, declarations, and the `Class::` qualifiers needed for separate compilation.

The entry point remains **`moveit.cpp`**. The normal build retains the original console `main()` and `--test` option. The `MOVEIT_WEB` build selects a separate C++ HTTP/MySQL entry point in that same file.

## Build and run

From the project root:

```bash
cd cpp-modular
make
make run
```

The console mode requires a C++17 compiler and Make. The web mode described below additionally uses MySQL and OpenSSL; Node.js builds the React frontend. A direct compiler command also works:

```bash
c++ -std=c++17 -O2 -Iinclude moveit.cpp src/*.cpp -o moveit
./moveit
```

Demo accounts use password `Password@123`:

- Admin: `admin@geu.ac.in`
- Student: `rahul.student@geu.ac.in`

In console mode, data is held in memory and reseeded on each launch. Console notification delivery is the existing simulation. In web mode, all application data is stored in MySQL and notifications appear in the browser inbox.

## Modules

| Files | Responsibility |
| --- | --- |
| `moveit.cpp` | Original `main()`; selects the interactive app or self-tests |
| `include/common.hpp` | Original standard includes and shared `string` / `vector` aliases |
| `include/entities.hpp` | Station, user, driver, vehicle, route, trip, booking, notification and conflict types |
| `include/application.hpp`, `src/application.cpp` | Application composition, login/signup, role menus and CRUD commands |
| `include/database.hpp`, `src/database.cpp` | In-memory tables, seed data, booking capacity checks and status transitions |
| `include/security.hpp`, `src/security.cpp` | Existing SHA-256, salts and password hashing |
| `include/geo.hpp`, `src/geo.cpp` | Existing Haversine distance calculation |
| `include/scheduling.hpp`, `src/scheduling.cpp` | FCFS, priority sorting and seat assignment |
| `include/notifications.hpp`, `src/notifications.cpp` | Existing simulated notification messages and log entries |
| `include/booking_service.hpp`, `src/booking_service.cpp` | Demand, nearby alternatives, bookings and batch scheduling |
| `include/console.hpp`, `src/console.cpp` | Input parsing, end-of-input state and console separators |
| `include/utils.hpp`, `src/utils.cpp` | Time formatting and text helpers |
| `include/self_tests.hpp`, `src/self_tests.cpp` | All 15 original self-tests |

`App` owns the database and passes that same database to `Notifier` and `BookingService`. `BookingService` calls the distance and scheduling functions, stores bookings through `Database`, and sends messages through `Notifier`. The database uses the security and text helpers. Console input and formatting support the application menus.

```mermaid
flowchart TD
    Main[moveit.cpp] --> App[Application menus]
    Main --> Tests[Original self-tests]
    App --> Console[Console helpers]
    App --> DB[Database and entities]
    App --> Booking[Booking service]
    Booking --> DB
    Booking --> Geo[Geolocation]
    Booking --> Scheduling[Scheduling]
    Booking --> Notifications[Notifications]
    Notifications --> DB
    DB --> Security[Security]
    DB --> Utils[Text and time utilities]
    Console --> Utils
    Notifications --> Utils
```

Headers declare each module's interface. Implementations live in the matching `.cpp` files; the `Database::find` template stays in its header because C++ templates must be visible where they are instantiated. The original default argument values are declared in headers and omitted from definitions, as required by C++.

## Verification

```bash
make test
make verify
```

`make test` runs all original self-tests. `make verify` additionally requires Python 3 and the original `../cpp/moveit.cpp`. It checks original-source and method-body hashes, checks unchanged free-function bodies and `main()`, compiles the original into a temporary directory, and compares both executables' test results and scripted console sessions. Displayed wall-clock times are normalized for comparison.

The comparison covers admin/student login, invalid credentials, stations and trips, booking/cancellation, pending requests and batch scheduling, administrative CRUD, notifications, nearby alternatives, signup, and end-of-input handling. `tests/source-map.json` records the source hash and method-body hashes used for these checks.


## C++ web frontend and MySQL mode

The new web mode serves the React frontend directly from C++, with a C++ REST API and persistent MySQL storage. The Express server is not needed for this mode. Everything is contained in this `cpp-modular/` folder; the original `cpp/`, `backend/` and `frontend/` folders are unchanged.

The web application retains the pine/marigold/paper design, login/signup, student/faculty bookings, driver dashboard, admin CRUD, demand board, allocation board, fleet status, fixed departure slots, and in-app notifications.

### Setup

Requirements:

- C++17 compiler and Make.
- MySQL server and C client development files, including `mysql_config`.
- OpenSSL development headers and `libcrypto` for PBKDF2 password hashing, secure random values and signed session tokens.
- Node.js/npm for building the React assets.

From `cpp-modular/`:

```bash
cp .env.example .env
# Edit DB_HOST, DB_USER, DB_PASSWORD and optionally DB_SOCKET_PATH.
# DB_NAME defaults to the separate moveit_cpp database.
make web
make init-sql
cd frontend
npm ci
cd ..
make frontend
make serve
```

Open **http://127.0.0.1:5002**. The C++ process serves both `/api/...` and the built frontend, including browser refreshes on dashboard routes. Run commands from `cpp-modular/` so the `.env`, SQL schema and frontend paths resolve correctly.

`make init-sql` creates only an empty database. It refuses to overwrite any existing tables. The schema has its own seeded accounts and PBKDF2 password hashes; it does not migrate data or credentials from the Express database. `make seed-sql` fills the next seven days without overwriting existing trips. Never point initialization at a database containing other application data.

Available demo accounts (password **`Password@123`**):

| Role | Email |
| --- | --- |
| Admin | `admin@geu.ac.in` |
| Student | `rahul.student@geu.ac.in` |
| Faculty | `sunita.verma@geu.ac.in` |
| Driver | `driver@geu.ac.in` |

Signup creates student/faculty accounts. Administrative and driver accounts are seeded or managed by the institution. A driver can update only their own trip's status. Web passwords use PBKDF2-HMAC-SHA256 with 210,000 iterations and independent random salts. Signed HS256 JWTs expire after seven days, and the server reads the current role from SQL on each authenticated request. Set `JWT_SECRET` to a random value of at least 32 characters to keep sessions valid across restarts; without it the server generates a fresh random key on startup.

### Frontend development

```bash
./scripts/dev.sh
```

This starts the C++ API on port 5002 and Vite on port 3001. Vite forwards `/api` requests to C++. Stop with Ctrl+C. The production build uses relative `/api` URLs and runs entirely on port 5002. `npm ci` is needed only when frontend dependencies are absent; the local workspace may reuse the existing frontend dependency directory.

The console remains available separately with `make run`, and its original behavior is preserved.

### Data and behavior

`sql/schema.sql` supplies the existing station, user, driver, vehicle, route, departure-slot, trip, booking and notification tables, plus relational constraints, capacity triggers and seed data. Slots remain 1:00 PM, 4:00 PM and 6:00 PM in Asia/Kolkata. A request maps to the next departure at or after the preferred time. Requests after 6:00 PM map to 1:00 PM the next day. If today's mapped departure has passed, the request moves to the next college departure. Requests for a destination without a direct trip are counted and kept open while the rider reviews alternatives.

### Demand-based ride requests

- Demand includes confirmed bookings, unexpired requests awaiting a choice, and the new request for that destination, travel date and slot. At `HIGH_DEMAND_THRESHOLD` (default 5), the new request confirms immediately if a seat is available. Existing requests awaiting a choice stay open until each commuter acts or the request expires.
- Below the threshold the booking is saved as `awaiting_choice`. It adds to demand and leaves seat occupancy unchanged. The commuter can confirm a departure for the same destination, choose a nearby destination, or cancel. Choosing a trip explicitly confirms the booking if a seat is available, even at low demand.
- Options show fresh rider counts and seat availability. Nearby departures are within 15 km and limited to the five nearest available options, with earlier departures first when distances match. The timetable also lists other scheduled college buses with available seats and shows where each bus goes. A full target returns HTTP 409 and the request stays open.
- `AWAITING_CHOICE_TTL_MINUTES` defaults to 30. Requests expire at that deadline or the original departure, whichever comes first. A background worker cancels expired requests and records an in-app notice even when the rider has closed the browser.
- Admin demand views count awaiting requests. The bookings table displays **Awaiting choice** separately from legacy **Pending** and **Confirmed**.

Existing MySQL databases apply [003_demand_flow.sql](backend/src/models/migrations/003_demand_flow.sql) and [004_unassigned_ride_requests.sql](backend/src/models/migrations/004_unassigned_ride_requests.sql) once, in order. Stop the web server, select the configured database in the MySQL client, run each outstanding migration using the MySQL client's `source` command, and restart the updated server. Fresh databases use the updated schema via `make init-sql`.

Vehicle and driver uniqueness is enforced for each date/slot in MySQL. Maintenance/inactive buses cannot be allocated. Prepared statements bind every user value. Booking transactions lock the trip before claiming seats; MySQL triggers check capacity and update occupancy when bookings enter or leave confirmed status, move between trips, or are deleted. Booking details include departure, countdown, bus, driver/contact and route. Notifications, users, bookings and allocations survive server restarts.

### Web modules

| Location | Purpose |
| --- | --- |
| `moveit.cpp` | Selects the original console or new C++ web entry point at build time |
| `web/src/web_server.cpp` | HTTP server, JSON error responses, React assets and SPA routes |
| `web/src/web_service.cpp` | Authenticated API, SQL-backed bookings, CRUD, driver permissions and admin views |
| `web/src/sql_store.cpp` | MySQL prepared statements, result mapping, transactions, schema initialization and schedule seeding |
| `web/src/web_common.cpp` | Configuration, India-time slot mapping, PBKDF2 and signed tokens |
| `web/include/` | Interfaces between the web modules |
| `web/vendor/` | Pinned cpp-httplib and nlohmann/json headers and their licenses |
| `sql/schema.sql` | Dedicated MySQL schema and demo data |
| `frontend/` | React source, theme, API client and production-build configuration |
| `tests/test_web.py` | Real HTTP/MySQL integration checks in a disposable database |

The SQL web service calls the existing C++ scheduling functions for FCFS/priority allocation and the existing Haversine function for distance requests. The original in-memory `Database` remains the console-mode implementation; `web::Sql` is the persistent web-mode implementation.

```mermaid
flowchart LR
    Browser[React frontend] --> HTTP[C++ HTTP server]
    HTTP --> Service[C++ web service]
    Service --> SQL[Prepared statements and transactions]
    SQL --> DB[(MySQL)]
    Service --> Algorithms[Existing C++ scheduling and distance modules]
```

### API compatibility

Success responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "message": ... }`. Authenticated requests send `Authorization: Bearer <token>`.

| Endpoint group | Supported behavior |
| --- | --- |
| `GET /api/health` | Reports the running C++ backend and MySQL connection |
| `/api/auth/login`, `/api/auth/signup`, `/api/auth/me` | Login, commuter signup and profile |
| `/api/stations`, `/api/vehicles`, `/api/drivers`, `/api/routes` | Public reads and admin create/update/delete |
| `/api/trips`, `/api/trips/:id` | Trip reads, admin date/slot allocation and driver status updates |
| `POST /api/trips/:id/schedule-batch` | Existing C++ FCFS/priority allocation for pending bookings |
| `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings` | Own bookings, confirmed departure details and direct reservations |
| `POST /api/bookings/request` | Takes `destination_station_id`, `date` (YYYY-MM-DD), `preferred_time` (HH:MM) and `priority`. Returns `confirmed` with departure details, `low_demand` with ride options, or `awaiting_choice` with options when demand meets the threshold and no direct bus is available. The legacy `requested_time` input is also accepted. |
| `GET /api/bookings/:id/options`, `POST /api/bookings/:id/resolve` | Owner-only endpoints for an open request. Resolve with `choose_slot` and `slot_id`, `choose_nearby` with `destination_station_id` and `slot_id`, `choose_departure` with a scheduled destination and slot, or `cancel`. |
| `PUT /api/bookings/:id/cancel`, `PUT /api/bookings/:id/status` | Owner cancellation and admin status changes |
| `GET /api/notifications`, `PUT /api/notifications/:id/read` | Own inbox and mark-read action |
| `GET /api/slots` | Three fixed departures for authenticated users |
| `GET /api/admin/slots/summary`, `/api/admin/demand/hourly` | Per-destination slot demand and requested-hour buckets |
| `GET /api/admin/bookings`, `/api/admin/fleet` | Filtered booking records and day-specific bus allocations |
| `GET /api/admin/allocations`, `/api/admin/drivers/status` | Slot board, warnings, driver trips and derived status |
| `/api/users`, `/api/users/:id` | Admin listing/deletion and owner profile access/update |

The admin date parameter is `?date=YYYY-MM-DD`; booking filters additionally support `station_id`, `slot_id` and `status`, and hourly demand accepts `station_id`.

### Waiting for the original ride

Choose **Wait for my preferred time** when requesting a ride, or **Keep my original request** from the alternatives. The request keeps its original destination, date and preferred time and contributes to hourly demand while open. The server checks for a bus after the configured choice window (30 minutes by default), including when the commuter is signed out. A match is a future campus departure to the requested destination, at the preferred time or a custom departure up to 30 minutes later on the same day. The rider receives an in-app update and must confirm an available seat.

Admins can schedule a **Custom departure** from **Trips**. Before running this version against an existing C++ database, apply [005_original_ride_wait.sql](sql/005_original_ride_wait.sql) once. Fresh databases include the changes in the schema.

### WhatsApp sandbox ride updates

Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM` to the backend `.env`. Use the sandbox sender in `whatsapp:+…` format and join the sandbox from your own WhatsApp number. Set that number, including country code, as the test rider's contact number. Restart the web server from this directory, or set `MOVEIT_ENV_FILE` to the absolute path to this `.env` when launching it from another folder.

For an existing C++ database, apply [006_whatsapp_updates.sql](sql/006_whatsapp_updates.sql) once before restarting. Opt in with **Send ride updates to my WhatsApp** when placing a request. Each new in-app ride notice is also queued for opted-in riders, including an acknowledgement when a preferred request is saved. A dedicated worker checks the queue every three seconds and also sends cancellation, rejection, departure and completion updates. Booking details show the latest submission status. Use Twilio Message Logs to check delivery or read receipts. Set `WHATSAPP_ENABLED=0` to disable sending or `WHATSAPP_SIMULATE=1` to exercise the queue without contacting Twilio. The legacy sandbox sends custom text during the 24-hour window opened by an inbound WhatsApp message. For the new Twilio trial, use the sender and pre-approved template SID shown in Try out WhatsApp. Set the SID as TWILIO_WHATSAPP_CONTENT_SID. Each alert uses that template text on WhatsApp, and the app inbox shows the full booking details. For live ride details outside the 24-hour window, use a registered WhatsApp sender and an approved Move It template. Set TWILIO_WHATSAPP_RIDE_CONTENT_SID to its HX ID. This takes precedence over TWILIO_WHATSAPP_CONTENT_SID. The first variable is the booking number and the second is the same ride update displayed in the app.

Example utility template body:

> Move It shuttle update for booking #{{1}}. Ride status update: {{2}} Open Move It to view your current booking.

Example variables are 42 and Your shuttle request to Clock Tower is saved. Submit the template in Twilio's Content Template Builder and wait for WhatsApp approval before using its SID.

### Checks

```bash
make verify
make frontend
make test-web-unit
make test-web
cd frontend && npm run test:ui
```

`make verify` still compares the original console with the console build, including all 15 original tests and 14 scripted sessions. `make test-web-unit` runs 22 checks for datetime/slot mapping, SQL-number conversion, password hashing and signed tokens without a database. `make test-web` requires a running MySQL server, the MySQL CLI, a built frontend and a database user allowed to create/drop test databases. It creates a unique `moveit_cpp_<number>_test` database, tests the C++ process over HTTP, and drops only that database during cleanup. Checks cover permissions, fixed slots, the demand boundary, option filtering and ordering, expiry, seat-count transitions, concurrent requests for the last seat, CRUD and restart persistence.
