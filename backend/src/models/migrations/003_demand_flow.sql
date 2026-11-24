-- Apply once to an existing Move It database while the web server is stopped.
-- Existing bookings and occupied seat counts are preserved.
ALTER TABLE BOOKING
    MODIFY status ENUM('confirmed', 'pending', 'rejected', 'cancelled', 'awaiting_choice') DEFAULT 'pending',
    ADD COLUMN expires_at DATETIME NULL,
    ADD COLUMN active_trip_id INT GENERATED ALWAYS AS
        (CASE WHEN status IN ('confirmed','pending','awaiting_choice') THEN trip_id ELSE NULL END) VIRTUAL,
    ADD INDEX booking_user (user_id),
    ADD INDEX booking_expiry (status, expires_at);

ALTER TABLE BOOKING
    DROP INDEX unique_user_trip,
    ADD CONSTRAINT unique_user_trip UNIQUE (user_id, active_trip_id);

DROP TRIGGER before_booking_insert;
DROP TRIGGER before_booking_update;
DROP TRIGGER after_booking_insert;
DROP TRIGGER after_booking_update;

DELIMITER $$
-- TRIGGER 1: before_booking_insert
-- Awaiting choice is demand only, including when there are no vacant seats.
-- Confirmed inserts take a seat. Legacy pending inserts retain their existing guard.
CREATE TRIGGER before_booking_insert
BEFORE INSERT ON BOOKING
FOR EACH ROW
BEGIN
    DECLARE current_seats INT DEFAULT 0;
    DECLARE max_capacity INT DEFAULT 0;
    DECLARE locked_vehicle INT;
    DECLARE vehicle_status VARCHAR(20);

    IF NOT (NEW.status <=> 'awaiting_choice') THEN
        SET NEW.expires_at = NULL;
    END IF;

    IF NEW.status IN ('confirmed','pending') THEN
        -- Acquire the trip first, then the vehicle. Consistent ordering avoids lock cycles.
        SELECT seats_filled, vehicle_id INTO current_seats, locked_vehicle
        FROM TRIP WHERE trip_id = NEW.trip_id FOR UPDATE;
        SELECT capacity, status INTO max_capacity, vehicle_status
        FROM VEHICLE WHERE vehicle_id = locked_vehicle FOR UPDATE;

        IF vehicle_status IS NULL OR vehicle_status <> 'active' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
        END IF;
        IF current_seats >= max_capacity THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trip is fully booked. Choose another option.';
        END IF;
    END IF;
END$$

-- TRIGGER 2: before_booking_update
-- A transition into confirmed (or a confirmed move) must pass the target capacity
-- check, including awaiting_choice -> confirmed. Cancelling an unseated request needs no seat lock.
CREATE TRIGGER before_booking_update
BEFORE UPDATE ON BOOKING
FOR EACH ROW
BEGIN
    DECLARE current_seats INT DEFAULT 0;
    DECLARE max_capacity INT DEFAULT 0;
    DECLARE locked_vehicle INT;
    DECLARE vehicle_status VARCHAR(20);

    IF NOT (NEW.status <=> 'awaiting_choice') THEN
        SET NEW.expires_at = NULL;
    END IF;

    IF NEW.status = 'confirmed' AND (NOT (OLD.status <=> 'confirmed') OR OLD.trip_id <> NEW.trip_id) THEN
        SELECT seats_filled, vehicle_id INTO current_seats, locked_vehicle
        FROM TRIP WHERE trip_id = NEW.trip_id FOR UPDATE;
        SELECT capacity, status INTO max_capacity, vehicle_status
        FROM VEHICLE WHERE vehicle_id = locked_vehicle FOR UPDATE;

        IF vehicle_status IS NULL OR vehicle_status <> 'active' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bus is in maintenance or inactive';
        END IF;
        IF current_seats >= max_capacity THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trip is fully booked. Choose another option.';
        END IF;
    END IF;
END$$

-- TRIGGER 3: after_booking_insert
-- Confirmed inserts increment occupancy. Awaiting-choice inserts leave it unchanged.
CREATE TRIGGER after_booking_insert
AFTER INSERT ON BOOKING
FOR EACH ROW
BEGIN
    IF NEW.status = 'confirmed' THEN
        UPDATE TRIP SET seats_filled = seats_filled + 1 WHERE trip_id = NEW.trip_id;
    END IF;
END$$

-- TRIGGER 4: after_booking_update
-- Confirmed -> cancelled/rejected releases the old trip's seat.
-- Awaiting choice -> confirmed claims the target trip's seat.
-- Awaiting choice -> cancelled touches neither counter.
-- A confirmed move releases the old seat and claims the new seat in the same statement.
CREATE TRIGGER after_booking_update
AFTER UPDATE ON BOOKING
FOR EACH ROW
BEGIN
    IF OLD.status = 'confirmed' AND (NOT (NEW.status <=> 'confirmed') OR OLD.trip_id <> NEW.trip_id) THEN
        UPDATE TRIP SET seats_filled = GREATEST(0, seats_filled - 1) WHERE trip_id = OLD.trip_id;
    END IF;
    IF NEW.status = 'confirmed' AND (NOT (OLD.status <=> 'confirmed') OR OLD.trip_id <> NEW.trip_id) THEN
        UPDATE TRIP SET seats_filled = seats_filled + 1 WHERE trip_id = NEW.trip_id;
    END IF;
END$$

DELIMITER ;
