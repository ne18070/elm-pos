-- Hotel public booking configuration: cancellation policy and deposit info

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS hotel_cancellation_policy TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hotel_deposit_info         TEXT DEFAULT NULL;
