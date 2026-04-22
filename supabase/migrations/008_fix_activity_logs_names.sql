-- Fix missing user_names in activity_logs
-- This script fills the user_name column for existing logs using the users table.

UPDATE activity_logs
SET user_name = users.full_name
FROM users
WHERE activity_logs.user_id = users.id
  AND activity_logs.user_name IS NULL;

-- Add a foreign key to public.users to allow easier joins in the future
-- (Note: user_id already references auth.users)
ALTER TABLE activity_logs 
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey_public;

ALTER TABLE activity_logs 
  ADD CONSTRAINT activity_logs_user_id_fkey_public 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
