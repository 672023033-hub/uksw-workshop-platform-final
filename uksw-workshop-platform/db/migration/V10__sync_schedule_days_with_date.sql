-- V10: Sync Schedule Days of Week with Workshop Session Date
-- Automatically update schedule.day_of_week to match workshop_session.date

-- 0. FIX: Expand the day_of_week constraint to include SUNDAY
--    The original V1 schema only allowed MON-SAT. Workshops can fall on Sunday.
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_day_of_week_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_day_of_week_check
    CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'));

-- 1. Create a trigger function to automatically sync day_of_week with date
CREATE OR REPLACE FUNCTION sync_schedule_day_with_session_date()
RETURNS TRIGGER AS $$
DECLARE
    v_date DATE;
    v_day_of_week VARCHAR(10);
BEGIN
    -- Get the date from workshop_sessions
    SELECT date INTO v_date
    FROM workshop_sessions
    WHERE id = NEW.class_id;
    
    IF v_date IS NOT NULL THEN
        -- Calculate day of week from date
        v_day_of_week := UPPER(TRIM(TO_CHAR(v_date, 'Day')));
        -- Update the schedule's day_of_week to match
        NEW.day_of_week := v_day_of_week;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create trigger on schedules INSERT/UPDATE
CREATE TRIGGER trigger_sync_schedule_day
    BEFORE INSERT OR UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION sync_schedule_day_with_session_date();

-- 3. Create trigger function to update schedules when workshop_session date changes
CREATE OR REPLACE FUNCTION update_schedules_on_session_date_change()
RETURNS TRIGGER AS $$
DECLARE
    v_day_of_week VARCHAR(10);
BEGIN
    -- Only proceed if date has changed
    IF NEW.date IS DISTINCT FROM OLD.date THEN
        -- Calculate new day of week
        v_day_of_week := UPPER(TRIM(TO_CHAR(NEW.date, 'Day')));
        
        -- Update all schedules for this session
        UPDATE schedules
        SET day_of_week = v_day_of_week
        WHERE class_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger on workshop_sessions UPDATE
CREATE TRIGGER trigger_update_schedules_on_date_change
    AFTER UPDATE ON workshop_sessions
    FOR EACH ROW
    WHEN (NEW.date IS DISTINCT FROM OLD.date)
    EXECUTE FUNCTION update_schedules_on_session_date_change();

-- 5. Sync existing schedules with their workshop_session dates
UPDATE schedules s
SET day_of_week = UPPER(TRIM(TO_CHAR(ws.date, 'Day')))
FROM workshop_sessions ws
WHERE s.class_id = ws.id
AND ws.date IS NOT NULL;

COMMENT ON FUNCTION sync_schedule_day_with_session_date IS 
'Automatically syncs schedule.day_of_week with workshop_session.date on INSERT/UPDATE';

COMMENT ON FUNCTION update_schedules_on_session_date_change IS 
'Updates all schedules when workshop_session.date changes';
