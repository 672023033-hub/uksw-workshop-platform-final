-- V8: Backfill registration dates for existing workshops

-- Set registration_start to current timestamp where it is null
UPDATE workshop_sessions 
SET registration_start = CURRENT_TIMESTAMP 
WHERE registration_start IS NULL;

-- Set registration_end to the workshop execution date at end of day
UPDATE workshop_sessions 
SET registration_end = (date + TIME '23:59:59')
WHERE registration_end IS NULL AND date IS NOT NULL;

-- Fallback if date is somehow null (should not be due to V6, but for safety)
UPDATE workshop_sessions
SET registration_end = (CURRENT_DATE + INTERVAL '7 days')
WHERE registration_end IS NULL AND date IS NULL;
