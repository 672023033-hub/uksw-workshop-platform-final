-- V5: Workshop Enhancements
-- Add month, year, and status columns to workshop_sessions

-- Add month and year columns
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS month INT;
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS year INT;

-- Add status column with default 'active'
ALTER TABLE workshop_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'done'));

-- Set default values for existing rows to current month/year
UPDATE workshop_sessions SET month = EXTRACT(MONTH FROM CURRENT_DATE)::INT WHERE month IS NULL;
UPDATE workshop_sessions SET year = EXTRACT(YEAR FROM CURRENT_DATE)::INT WHERE year IS NULL;
UPDATE workshop_sessions SET status = 'active' WHERE status IS NULL;

-- Create index for filtering by month/year
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_month_year ON workshop_sessions(year, month);
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_status ON workshop_sessions(status);
