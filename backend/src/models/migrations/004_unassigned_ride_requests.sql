-- Apply after 003_demand_flow.sql. Bookings can collect demand before bus assignment.
ALTER TABLE BOOKING
    MODIFY COLUMN trip_id INT NULL,
    ADD COLUMN requested_trip_date DATE NULL AFTER trip_id;
