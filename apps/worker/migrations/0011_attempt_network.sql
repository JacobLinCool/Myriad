-- What the server saw when each submission arrived. The device ID comes from the
-- browser and can be reset; these give teachers independent evidence. Kept with
-- the attempt, without automatic expiry.
ALTER TABLE attempts ADD COLUMN client_ip TEXT;
ALTER TABLE attempts ADD COLUMN user_agent TEXT;
