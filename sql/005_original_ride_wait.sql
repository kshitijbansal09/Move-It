-- Apply once to an existing C++ web database before starting the updated service.
ALTER TABLE TRIP
    ADD UNIQUE KEY unique_vehicle_departure (vehicle_id, departure_time),
    ADD UNIQUE KEY unique_driver_departure (driver_id, departure_time);

ALTER TABLE BOOKING
    ADD COLUMN original_review_at DATETIME NULL,
    ADD COLUMN original_offer_trip_id INT NULL,
    ADD CONSTRAINT fk_original_offer_trip FOREIGN KEY (original_offer_trip_id)
        REFERENCES TRIP(trip_id) ON DELETE SET NULL;
