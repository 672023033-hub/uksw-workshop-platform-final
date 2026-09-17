-- V9: Seed Registration Dates for Testing Statuses

-- We will use the 'Intro to Golang' sessions for testing different statuses
-- Assuming IDs are consistent or we use subqueries.

DO $$
DECLARE
    v_tech1_code VARCHAR := 'WS_TECH_01'; -- Intro to Golang
    v_tech2_code VARCHAR := 'WS_TECH_02'; -- React
    v_biz_code   VARCHAR := 'WS_BIZ_01';  -- Digital Marketing
    
    v_tech1_id UUID;
    v_tech2_id UUID;
    v_biz_id   UUID;
BEGIN
    SELECT id INTO v_tech1_id FROM workshops WHERE code = v_tech1_code;
    SELECT id INTO v_tech2_id FROM workshops WHERE code = v_tech2_code;
    SELECT id INTO v_biz_id FROM workshops WHERE code = v_biz_code;

    -- 1. CLOSED Workshop (Registration Ended Yesterday)
    -- Target: Intro to Golang - Class A
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '7 days',
        registration_end = CURRENT_TIMESTAMP - INTERVAL '1 day',
        date = CURRENT_DATE + INTERVAL '5 days'
    WHERE workshop_id = v_tech1_id AND class_code = 'A';

    -- 2. UPCOMING Workshop (Registration Starts Tomorrow)
    -- Target: Intro to Golang - Class B
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP + INTERVAL '1 day',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '5 days',
        date = CURRENT_DATE + INTERVAL '10 days'
    WHERE workshop_id = v_tech1_id AND class_code = 'B';

    -- 3. OPEN Workshop (Registration Active)
    -- Target: React & Modern Frontend - Class A
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '2 days',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '5 days',
        date = CURRENT_DATE + INTERVAL '14 days'
    WHERE workshop_id = v_tech2_id AND class_code = 'A';

    -- 4. OPEN Workshop (Registration Active)
    -- Target: Digital Marketing - Class A
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '1 day',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '3 days',
        date = CURRENT_DATE + INTERVAL '7 days'
    WHERE workshop_id = v_biz_id AND class_code = 'A';

END $$;
