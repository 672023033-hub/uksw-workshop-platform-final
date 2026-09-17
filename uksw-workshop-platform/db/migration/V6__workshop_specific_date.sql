-- V6: Restrict Workshop to Single Date & Registration Periods
-- Add specific date, registration_start, and registration_end to workshop_sessions

-- 1. Add date column (Execution Date)
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS date DATE;

-- 2. Add Registration Period columns
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS registration_start TIMESTAMP;
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS registration_end TIMESTAMP;

-- 3. Populate date for existing records (default to CURRENT_DATE as fallback)
UPDATE workshop_sessions SET date = CURRENT_DATE WHERE date IS NULL;

-- 4. Create index for filtering by date and registration period
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_date ON workshop_sessions(date);
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_reg_start ON workshop_sessions(registration_start);
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_reg_end ON workshop_sessions(registration_end);

-- Note regarding Month/Year:
-- We keep month and year columns as they are useful for basic filtering, but the source of truth for execution is 'date'.
