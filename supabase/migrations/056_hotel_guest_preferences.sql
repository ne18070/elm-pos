-- Hotel guest profile enhancements: preferences, date of birth

ALTER TABLE hotel_guests
  ADD COLUMN IF NOT EXISTS preferences   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE DEFAULT NULL;
