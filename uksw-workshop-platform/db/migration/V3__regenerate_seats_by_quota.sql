-- V3: Regenerate Seats Based on Quota
-- This migration regenerates all seats to match their session quotas

-- Delete all existing seats (cascades to workshop_enrollment_seats)
DELETE FROM seats;

-- Regenerate seats for all workshop sessions based on their quota
-- The function will auto-calculate optimal row/column layout
DO $$
DECLARE
    session_record RECORD;
    seats_created INT;
BEGIN
    FOR session_record IN 
        SELECT id, quota FROM workshop_sessions 
        WHERE seats_enabled = true
        ORDER BY id
    LOOP
        seats_created := generate_seats_for_session(session_record.id);
        RAISE NOTICE 'Generated % seats for session % (quota: %)', 
            seats_created, session_record.id, session_record.quota;
    END LOOP;
END $$;

-- Verify seat counts match quotas
DO $$
DECLARE
    mismatch_count INT;
BEGIN
    SELECT COUNT(*) INTO mismatch_count
    FROM (
        SELECT 
            ws.id,
            ws.quota,
            COUNT(s.id) as seat_count
        FROM workshop_sessions ws
        LEFT JOIN seats s ON s.workshop_session_id = ws.id
        WHERE ws.seats_enabled = true
        GROUP BY ws.id, ws.quota
        HAVING COUNT(s.id) != ws.quota
    ) mismatches;
    
    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Seat count mismatch detected for % sessions', mismatch_count;
    ELSE
        RAISE NOTICE 'All seats match quotas! ✓';
    END IF;
END $$;
