-- V4: Auto-regenerate Seats on Quota Change
-- This migration adds a trigger to automatically regenerate seats when quota is updated

-- Function to handle seat regeneration on quota change
CREATE OR REPLACE FUNCTION auto_regenerate_seats()
RETURNS TRIGGER AS $$
BEGIN
    -- Only regenerate if quota changed or it's a new session with seats enabled
    IF (TG_OP = 'INSERT' AND NEW.seats_enabled = true) OR
       (TG_OP = 'UPDATE' AND NEW.quota != OLD.quota AND NEW.seats_enabled = true) THEN
        
        -- Delete existing seats for this session
        DELETE FROM seats WHERE workshop_session_id = NEW.id;
        
        -- Generate new seats based on new quota
        PERFORM generate_seats_for_session(NEW.id);
        
        RAISE NOTICE 'Auto-regenerated % seats for session %', NEW.quota, NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on workshop_sessions
CREATE TRIGGER trigger_auto_regenerate_seats
    AFTER INSERT OR UPDATE OF quota, seats_enabled
    ON workshop_sessions
    FOR EACH ROW
    EXECUTE FUNCTION auto_regenerate_seats();

-- Info message
DO $$
BEGIN
    RAISE NOTICE '✓ Seats will now auto-regenerate when mentor changes quota!';
END $$;
