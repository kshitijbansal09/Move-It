-- Dedicated C++ web schema. Initialization refuses nonempty databases.
-- ============================================================================
-- Move It: Smart College Transportation Management Platform
-- 5th Semester DBMS + OS Mini-Project Database Schema
-- Database: MySQL (InnoDB Storage Engine)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. STATION TABLE
-- Represents pick-up and drop-off hubs across the city and campus.
-- Coordinates are stored in DECIMAL(9,6) for sub-meter Haversine accuracy.
-- ----------------------------------------------------------------------------

CREATE TABLE STATION (
    station_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. USER TABLE
-- Stores commuters (students, faculty) and system administrators.
-- contact_info stores phone numbers in E.164 standard (e.g., +919876543210) for WhatsApp.
-- station_id links user to their default/preferred station.
-- ----------------------------------------------------------------------------
CREATE TABLE USER (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'faculty', 'admin', 'driver') NOT NULL DEFAULT 'student',
    station_id INT NULL,
    contact_info VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_station FOREIGN KEY (station_id) 
        REFERENCES STATION(station_id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. DRIVER TABLE
-- Registered institutional and outsourced transport drivers.
-- ----------------------------------------------------------------------------
CREATE TABLE DRIVER (
    driver_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    license_no VARCHAR(100) NOT NULL UNIQUE,
    contact_info VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. VEHICLE TABLE
-- College fleet information including seating capacity and operational status.
-- ----------------------------------------------------------------------------
CREATE TABLE VEHICLE (
    vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
    reg_number VARCHAR(100) NOT NULL UNIQUE,
    capacity INT NOT NULL,
    status ENUM('active', 'maintenance', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. ROUTE TABLE
-- Fixed transportation corridors connecting start and destination stations.
-- ----------------------------------------------------------------------------
CREATE TABLE ROUTE (
    route_id INT AUTO_INCREMENT PRIMARY KEY,
    route_name VARCHAR(255) NOT NULL,
    start_station_id INT NOT NULL,
    end_station_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_start FOREIGN KEY (start_station_id) 
        REFERENCES STATION(station_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    CONSTRAINT fk_route_end FOREIGN KEY (end_station_id) 
        REFERENCES STATION(station_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. TRIP TABLE
-- Concrete instances of scheduled transit runs combining vehicle, route, and driver.
-- seats_filled is a denormalized counter automatically synchronized via triggers.
-- ----------------------------------------------------------------------------
CREATE TABLE DEPARTURE_SLOT (
    slot_id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(20) NOT NULL,
    departure_time TIME NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT INTO DEPARTURE_SLOT (slot_id, label, departure_time) VALUES
(1, '1:00 PM', '13:00:00'), (2, '4:00 PM', '16:00:00'), (3, '6:00 PM', '18:00:00');

CREATE TABLE TRIP (
    trip_id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_id INT NOT NULL,
    route_id INT NOT NULL,
    driver_id INT NOT NULL,
    departure_time DATETIME NOT NULL,
    slot_id INT NULL,
    trip_date DATE NULL,
    -- WHY: unique indexes serialize concurrent allocation attempts in InnoDB.
    -- A physical bus and a driver can each serve only one route per date/slot.
    CONSTRAINT unique_vehicle_slot UNIQUE (vehicle_id, trip_date, slot_id),
    CONSTRAINT unique_driver_slot UNIQUE (driver_id, trip_date, slot_id),
    CONSTRAINT fk_trip_slot FOREIGN KEY (slot_id) REFERENCES DEPARTURE_SLOT(slot_id),
    seats_filled INT DEFAULT 0,
    status ENUM('scheduled', 'departed', 'completed') DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_vehicle FOREIGN KEY (vehicle_id) 
        REFERENCES VEHICLE(vehicle_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    CONSTRAINT fk_trip_route FOREIGN KEY (route_id) 
        REFERENCES ROUTE(route_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    CONSTRAINT fk_trip_driver FOREIGN KEY (driver_id) 
        REFERENCES DRIVER(driver_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. BOOKING TABLE
-- Commuter seat reservations for specific trips.
-- UNIQUE KEY unique_user_trip prevents duplicate reservations by the same user on one trip.
-- ----------------------------------------------------------------------------
CREATE TABLE BOOKING (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    trip_id INT NOT NULL,
    destination_station_id INT NULL,
    requested_time DATETIME NULL,
    slot_id INT NULL,
    CONSTRAINT fk_booking_destination FOREIGN KEY (destination_station_id) REFERENCES STATION(station_id),
    CONSTRAINT fk_booking_slot FOREIGN KEY (slot_id) REFERENCES DEPARTURE_SLOT(slot_id),
    priority ENUM('normal', 'urgent') DEFAULT 'normal',
    status ENUM('confirmed', 'pending', 'rejected', 'cancelled') DEFAULT 'pending',
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_trip UNIQUE (user_id, trip_id),
    CONSTRAINT fk_booking_user FOREIGN KEY (user_id) 
        REFERENCES USER(user_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_trip FOREIGN KEY (trip_id) 
        REFERENCES TRIP(trip_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. NOTIFICATION_LOG TABLE
-- In-app notification inbox and the preserved WhatsApp audit log.
-- twilio_sid allows correlating message status callbacks from Twilio.
-- ----------------------------------------------------------------------------
CREATE TABLE NOTIFICATION_LOG (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    twilio_sid VARCHAR(255) NULL,
    channel ENUM('in_app','whatsapp') NOT NULL DEFAULT 'in_app',
    type VARCHAR(50) NULL,
    booking_id INT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_notification_booking FOREIGN KEY (booking_id) REFERENCES BOOKING(booking_id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) 
        REFERENCES USER(user_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- ============================================================================
-- CONFLICT DETECTION & INTEGRITY TRIGGERS
-- Critical DBMS & OS concurrency synchronization logic.
-- ============================================================================

DELIMITER $$

-- WHY: API checks alone can race or be bypassed by direct SQL.
-- Reject unusable vehicles at the database boundary, including maintenance buses.
CREATE TRIGGER before_trip_insert
BEFORE INSERT ON TRIP
FOR EACH ROW
BEGIN
    DECLARE vehicle_status VARCHAR(20);
    DECLARE slot_time TIME;
    SELECT status INTO vehicle_status FROM VEHICLE WHERE vehicle_id = NEW.vehicle_id;
    IF vehicle_status IS NULL OR vehicle_status != 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
    END IF;
    -- Nullable columns preserve unmatched legacy trips. Fixed trips must agree.
    IF NEW.slot_id IS NOT NULL THEN
        SELECT departure_time INTO slot_time FROM DEPARTURE_SLOT WHERE slot_id = NEW.slot_id;
        IF NEW.trip_date IS NULL OR NEW.departure_time != TIMESTAMP(NEW.trip_date, slot_time) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departure must match the selected date and slot';
        END IF;
    END IF;
END$$

-- WHY: API checks alone can race or be bypassed by direct SQL.
-- Reject unusable vehicles at the database boundary, including maintenance buses.
CREATE TRIGGER before_trip_update
BEFORE UPDATE ON TRIP
FOR EACH ROW
BEGIN
    DECLARE vehicle_status VARCHAR(20);
    DECLARE slot_time TIME;
    SELECT status INTO vehicle_status FROM VEHICLE WHERE vehicle_id = NEW.vehicle_id;
    -- Seat counters must still update when a previously allocated bus enters
    -- maintenance, so cancellation can return the student's seat. Resource or
    -- departure changes still constitute an allocation and must be rejected.
    IF (vehicle_status IS NULL OR vehicle_status != 'active') AND (
        NEW.vehicle_id != OLD.vehicle_id OR NEW.route_id != OLD.route_id OR
        NEW.driver_id != OLD.driver_id OR NEW.status != OLD.status OR
        NOT (NEW.trip_date <=> OLD.trip_date) OR NOT (NEW.slot_id <=> OLD.slot_id) OR
        NEW.departure_time != OLD.departure_time) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
    END IF;
    -- Nullable columns preserve unmatched legacy trips. Fixed trips must agree.
    IF NEW.slot_id IS NOT NULL THEN
        SELECT departure_time INTO slot_time FROM DEPARTURE_SLOT WHERE slot_id = NEW.slot_id;
        IF NEW.trip_date IS NULL OR NEW.departure_time != TIMESTAMP(NEW.trip_date, slot_time) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departure must match the selected date and slot';
        END IF;
    END IF;
END$$



-- ----------------------------------------------------------------------------
-- TRIGGER 1: before_booking_insert
--
-- WHY THIS TRIGGER EXISTS (Viva / Academic Explanation):
-- In an OS and DBMS context, concurrent client threads might issue seat booking
-- requests at the exact same millisecond. If concurrency control were handled
-- purely in application memory, race conditions (time-of-check to time-of-use / TOCTOU)
-- could allow overbooking beyond physical vehicle capacity.
--
-- By placing this check in a database-level BEFORE INSERT trigger running inside
-- the transactional engine (InnoDB):
-- 1. It inspects the actual vehicle capacity joined from VEHICLE against TRIP.seats_filled.
-- 2. If the vehicle is already at capacity (seats_filled >= capacity), it raises
--    a standard SQL custom exception (SQLSTATE '45000').
-- 3. The transaction aborts atomically without polluting the database with illegal rows.
-- ----------------------------------------------------------------------------
CREATE TRIGGER before_booking_insert
BEFORE INSERT ON BOOKING
FOR EACH ROW
BEGIN
    DECLARE current_seats INT DEFAULT 0;
    DECLARE max_capacity INT DEFAULT 0;
    DECLARE vehicle_status VARCHAR(20);

    -- Look up the current occupancy and total vehicle capacity for this trip
    SELECT t.seats_filled, v.capacity, v.status
    INTO current_seats, max_capacity, vehicle_status
    FROM TRIP t
    INNER JOIN VEHICLE v ON t.vehicle_id = v.vehicle_id
    WHERE t.trip_id = NEW.trip_id FOR UPDATE;

    IF NEW.status IN ('confirmed','pending') AND (vehicle_status IS NULL OR vehicle_status != 'active') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
    END IF;

    -- Prevent insert if already full (unless inserting as rejected/cancelled)
    IF NEW.status != 'rejected' AND NEW.status != 'cancelled' AND current_seats >= max_capacity THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Trip is fully booked — conflict detected';
    END IF;
END$$

-- ----------------------------------------------------------------------------
-- TRIGGER 2: before_booking_update
--
-- WHY THIS TRIGGER EXISTS (Viva / Academic Explanation):
-- If a booking is updated from 'pending' to 'confirmed' (e.g. after batch scheduling),
-- we must verify that another booking didn't snatch the last remaining seat in the interim.
-- This ensures state transition safety on existing records.
-- ----------------------------------------------------------------------------
CREATE TRIGGER before_booking_update
BEFORE UPDATE ON BOOKING
FOR EACH ROW
BEGIN
    DECLARE current_seats INT DEFAULT 0;
    DECLARE max_capacity INT DEFAULT 0;
    DECLARE vehicle_status VARCHAR(20);

    IF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
        SELECT t.seats_filled, v.capacity, v.status
        INTO current_seats, max_capacity, vehicle_status
        FROM TRIP t
        INNER JOIN VEHICLE v ON t.vehicle_id = v.vehicle_id
        WHERE t.trip_id = NEW.trip_id FOR UPDATE;

        IF vehicle_status IS NULL OR vehicle_status != 'active' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
        END IF;

        IF current_seats >= max_capacity THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Trip is fully booked — conflict detected';
        END IF;
    END IF;
END$$

-- ----------------------------------------------------------------------------
-- TRIGGER 3: after_booking_insert
--
-- WHY THIS TRIGGER EXISTS (Viva / Academic Explanation):
-- Implements automated denormalization maintenance. Rather than forcing application
-- developers to execute two coupled queries (INSERT booking + UPDATE trip counter),
-- this trigger guarantees that whenever a booking is created with 'confirmed' status,
-- the trip's seats_filled counter is incremented synchronously and atomically.
-- ----------------------------------------------------------------------------
CREATE TRIGGER after_booking_insert
AFTER INSERT ON BOOKING
FOR EACH ROW
BEGIN
    IF NEW.status = 'confirmed' THEN
        UPDATE TRIP
        SET seats_filled = seats_filled + 1
        WHERE trip_id = NEW.trip_id;
    END IF;
END$$

-- ----------------------------------------------------------------------------
-- TRIGGER 4: after_booking_update
--
-- WHY THIS TRIGGER EXISTS (Viva / Academic Explanation):
-- Manages resource release and allocation on booking status transitions:
-- 1. When a user cancels their seat or an admin rejects a previously confirmed booking,
--    it decrements seats_filled by 1 (bounded at 0), instantly making the seat
--    available for waiting-list / urgent commuters.
-- 2. When a pending request is upgraded to 'confirmed', it increments seats_filled by 1.
-- ----------------------------------------------------------------------------
CREATE TRIGGER after_booking_update
AFTER UPDATE ON BOOKING
FOR EACH ROW
BEGIN
    -- Scenario A: Seat released (confirmed -> cancelled/rejected)
    IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
        UPDATE TRIP
        SET seats_filled = GREATEST(0, seats_filled - 1)
        WHERE trip_id = NEW.trip_id;
    -- Scenario B: Seat claimed (pending/other -> confirmed)
    ELSEIF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
        UPDATE TRIP
        SET seats_filled = seats_filled + 1
        WHERE trip_id = NEW.trip_id;
    END IF;
END$$

-- WHY: deleting an occupied reservation must release the same physical seat.
CREATE TRIGGER after_booking_delete
AFTER DELETE ON BOOKING
FOR EACH ROW
BEGIN
    IF OLD.status = 'confirmed' THEN
        UPDATE TRIP SET seats_filled = GREATEST(0, seats_filled - 1) WHERE trip_id = OLD.trip_id;
    END IF;
END$$

DELIMITER ;


-- ============================================================================
-- SEED DATA
-- ============================================================================

-- 1. Seed exactly 9 required Dehradun / Doon-Valley Stations
INSERT INTO STATION (station_id, name, latitude, longitude) VALUES
(1, 'Graphic Era University (Campus)', 30.267500, 77.995900),
(2, 'Clock Tower', 30.325600, 78.043700),
(3, 'Prem Nagar', 30.332600, 77.958300),
(4, 'Mothrowala', 30.263000, 78.032300),
(5, 'ONGC Chowk', 30.340900, 78.019000),
(6, 'Doiwala', 30.179800, 78.123200),
(7, 'Jolly Grant Airport', 30.196700, 78.087700),
(8, 'Vikasnagar', 30.468000, 77.774000),
(9, 'Rishikesh', 30.107800, 78.292500);

-- 2. Seed Users
-- C++ web demo passwords: Password@123 (PBKDF2-HMAC-SHA256, 210000 rounds).
INSERT INTO USER (user_id, name, email, password_hash, role, station_id, contact_info) VALUES
(1, 'Dr. Rajesh Sharma (Transport Admin)', 'admin@geu.ac.in', 'pbkdf2-sha256$210000$ad68c66d25a8e2f62df046d1d450c033$4d7bad2c5396afe1830a72d6c1b15997bed58630609dbb991384e1338639a9e9', 'admin', 1, '+919876543210'),
(2, 'Prof. Sunita Verma', 'sunita.verma@geu.ac.in', 'pbkdf2-sha256$210000$3cbd484e354af617808aa4b0a9087447$4384cb9e661b2e75b3088b90c0130890ae1934f64e95078e853264a325523e4f', 'faculty', 2, '+919876543211'),
(3, 'Dr. Amit Negi', 'amit.negi@geu.ac.in', 'pbkdf2-sha256$210000$516fbb9fe15aa79291eab4e3e38f4ead$64ea0a396540242cc7f24fe4b8dec79946924ad369fbc64d706608a685e9b816', 'faculty', 5, '+919876543212'),
(4, 'Rahul Joshi', 'rahul.student@geu.ac.in', 'pbkdf2-sha256$210000$516b876d87f2126d5fc2ab0021d85e6f$4c649b85a834faa8e8ea19d7208b51fe0a86baa0a11c4354ccb64798602fe21d', 'student', 3, '+919876543213'),
(5, 'Priya Chauhan', 'priya.student@geu.ac.in', 'pbkdf2-sha256$210000$f0bb7d7abb485cb4ea2a27b445fddcc0$6a217b76e0cf96e60e6b559ad880deb21b2091a27a423886c5809980ff659fe6', 'student', 6, '+919876543214'),
(6, 'Aman Rawat', 'aman.student@geu.ac.in', 'pbkdf2-sha256$210000$a2544aaa648fe443f6ebcbf2dfe5e341$3dccaf502612c4c403dd4ddcd3fe7c22da00c0e884f04b355dddb05f27c6708c', 'student', 8, '+919876543215');

-- 3. Seed Drivers
INSERT INTO DRIVER (driver_id, name, license_no, contact_info) VALUES
(1, 'Ramesh Chand', 'UK07-2019-0012345', '+919811122334'),
(2, 'Gurpreet Singh', 'UK07-2020-0067890', '+919822233445'),
(3, 'Mohan Lal', 'UK07-2018-0099887', '+919833344556'),
(4, 'Dev Singh', 'UK07-2021-0044556', '+919844455667');

-- 4. Seed Vehicles (Varying capacities to demonstrate scheduling)
INSERT INTO VEHICLE (vehicle_id, reg_number, capacity, status) VALUES
(1, 'UK07-PA-1001 (Bus #1)', 40, 'active'),
(2, 'UK07-PB-2002 (Mini-Bus #2)', 25, 'active'),
(3, 'UK07-TA-3003 (Shuttle #3)', 14, 'active'),
(4, 'UK07-TB-4004 (Van #4)', 8, 'active'),
(5, 'UK07-PA-5005 (Bus #5)', 40, 'maintenance');

-- 5. Seed Routes
INSERT INTO ROUTE (route_id, route_name, start_station_id, end_station_id) VALUES
(1, 'GEU Campus <-> Clock Tower Express', 1, 2),
(2, 'GEU Campus <-> Doiwala Corridor', 1, 6),
(3, 'GEU Campus <-> Vikasnagar Route', 1, 8),
(4, 'GEU Campus <-> Prem Nagar Local', 1, 3);

-- 6. Initial trips use the fixed departures; seed-schedule fills the next week.
INSERT INTO TRIP (trip_id, vehicle_id, route_id, driver_id, trip_date, slot_id, departure_time, seats_filled, status) VALUES
(1, 1, 1, 1, CURRENT_DATE, 1, TIMESTAMP(CURRENT_DATE, '13:00:00'), 0, 'scheduled'),
(2, 2, 2, 2, CURRENT_DATE, 1, TIMESTAMP(CURRENT_DATE, '13:00:00'), 0, 'scheduled'),
(3, 3, 3, 3, CURRENT_DATE, 1, TIMESTAMP(CURRENT_DATE, '13:00:00'), 0, 'scheduled'),
(4, 4, 4, 4, CURRENT_DATE, 1, TIMESTAMP(CURRENT_DATE, '13:00:00'), 0, 'scheduled');

-- 7. Seed Initial Sample Bookings
-- Trigger after_booking_insert will automatically update seats_filled on TRIP 1 and TRIP 2
INSERT INTO BOOKING (user_id, trip_id, priority, status) VALUES
(4, 1, 'normal', 'confirmed'),
(2, 1, 'urgent', 'confirmed'),
(5, 2, 'normal', 'confirmed');

UPDATE BOOKING b JOIN TRIP t ON b.trip_id = t.trip_id JOIN ROUTE r ON t.route_id = r.route_id
SET b.destination_station_id = r.end_station_id, b.slot_id = t.slot_id, b.requested_time = t.departure_time;
INSERT INTO USER (name,email,password_hash,role,station_id,contact_info) VALUES ('Ramesh Chand','driver@geu.ac.in','pbkdf2-sha256$210000$e2d32bfa6da14e3ceb8b511b153543ac$834221fc0b1aba92cc8f473a93ba5deae7914884bbe23efe83495a0ab6e4b114','driver',1,'+919811122334');

