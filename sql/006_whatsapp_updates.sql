-- Keep consent tied to the booking and index WhatsApp jobs separately from the inbox.
ALTER TABLE BOOKING ADD COLUMN whatsapp_recipient VARCHAR(20) NULL;
ALTER TABLE NOTIFICATION_LOG ADD INDEX notification_outbox (channel,status,notification_id);
