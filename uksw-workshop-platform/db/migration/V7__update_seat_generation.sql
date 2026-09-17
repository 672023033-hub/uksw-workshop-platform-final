-- V7: Update Seat Generation Logic
-- Allows specifying rows and columns for seat generation

-- Drop existing function if exists (to avoid signature conflicts if we were just replacing, but we are changing signature)
-- Drop dependent trigger and function first
DROP TRIGGER IF EXISTS trigger_auto_regenerate_seats ON workshop_sessions;
DROP FUNCTION IF EXISTS auto_regenerate_seats();

-- Drop existing function if exists
DROP FUNCTION IF EXISTS generate_seats_for_session(UUID);

-- Create new function with rows and cols parameters
CREATE OR REPLACE FUNCTION generate_seats_for_session(
    p_session_id UUID,
    p_rows INT,
    p_cols INT
) RETURNS INT AS $$
DECLARE
    v_quota INT;
    v_row_letter CHAR(1);
    v_col INT;
    v_seat_number VARCHAR(10);
    v_count INT := 0;
BEGIN
    -- Get quota from session
    SELECT quota INTO v_quota
    FROM workshop_sessions
    WHERE id = p_session_id;
    
    IF v_quota IS NULL THEN
        RAISE EXCEPTION 'Session not found: %', p_session_id;
    END IF;

    -- Validate input
    IF p_rows * p_cols < v_quota THEN
        RAISE EXCEPTION 'Seats capacity (% x % = %) is less than quota (%)', p_rows, p_cols, p_rows * p_cols, v_quota;
    END IF;

    -- Generate seats row by row
    FOR i IN 1..p_rows LOOP
        -- Generate row letter: A, B, C... (handle > 26? currently limit to 26 in UI)
        -- If i > 26, maybe AA, AB? For now simple CHAR logic for 1-26
        IF i <= 26 THEN
            v_row_letter := CHR(64 + i);
        ELSE
            -- Fallback or advanced logic, but UI limits to 26
            v_row_letter := '?'; 
        END IF;
        
        FOR v_col IN 1..p_cols LOOP
            -- Stop if we've reached the exact quota?
            -- User might want specific layout even if quota is smaller.
            -- But usually we only want 'quota' number of seats.
            -- However, if layout is 5x5 (25) and quota is 20, last 5 seats?
            -- Existing logic stopped at quota.
            -- Let's stick to stopping at quota for now to match enrolled_count logic.
            EXIT WHEN v_count >= v_quota;
            
            v_seat_number := v_row_letter || v_col::TEXT;
            
            INSERT INTO seats (
                workshop_session_id,
                seat_number,
                row_letter,
                column_number,
                status
            ) VALUES (
                p_session_id,
                v_seat_number,
                v_row_letter,
                v_col,
                'AVAILABLE'
            );
            
            v_count := v_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
