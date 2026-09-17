-- V13: Seed Registration Dates and Historical Data
-- This migration seeds diverse workshop scenarios for testing:
-- 1. Upcoming Registration (Not yet open)
-- 2. Open Registration (Active now)
-- 3. Closed Registration (Registration ended, workshop hasn't started)
-- 4. Completed Workshop (Date in past, for history/rating testing)

DO $$
DECLARE
    -- Workshop Codes (from initial seed)
    v_tech1_code VARCHAR := 'WS_TECH_01'; -- Intro to Golang
    v_tech2_code VARCHAR := 'WS_TECH_02'; -- React & Modern Frontend
    v_biz_code   VARCHAR := 'WS_BIZ_01';  -- Digital Marketing Strategies
    v_lead_code  VARCHAR := 'WS_LEAD_01'; -- Leadership 101
    
    -- IDs
    v_tech1_id UUID;
    v_tech2_id UUID;
    v_biz_id   UUID;
    v_lead_id  UUID;
    v_mentor_id UUID;
    v_student_id UUID;
    v_completed_session_id UUID;
BEGIN
    -- Get Workshop IDs
    SELECT id INTO v_tech1_id FROM workshops WHERE code = v_tech1_code;
    SELECT id INTO v_tech2_id FROM workshops WHERE code = v_tech2_code;
    SELECT id INTO v_biz_id FROM workshops WHERE code = v_biz_code;
    SELECT id INTO v_lead_id FROM workshops WHERE code = v_lead_code;
    
    -- Get a Mentor ID
    SELECT id INTO v_mentor_id FROM mentors LIMIT 1;
    
    -- Get Test Student ID (NIM 672019001)
    SELECT s.id INTO v_student_id 
    FROM students s JOIN users u ON s.user_id = u.id 
    WHERE u.nim_nidn = '672019001';

    ---------------------------------------------------------------------------
    -- SCENARIO 1: UPCOMING REGISTRATION
    -- Workshop: Leadership 101 (Class A)
    -- Status: Active (but registration future)
    -- Date: 1 Month from now
    ---------------------------------------------------------------------------
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP + INTERVAL '2 days',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '10 days',
        date = CURRENT_DATE + INTERVAL '30 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '30 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '30 days'))::INT,
        status = 'active'
    WHERE workshop_id = v_lead_id AND class_code = 'A';

    ---------------------------------------------------------------------------
    -- SCENARIO 2: OPEN REGISTRATION (ACTIVE)
    -- Workshop: React & Modern Frontend (Class A)
    -- Status: Active
    -- Date: 2 Weeks from now
    -- Reg: Started 2 days ago, ends in 5 days
    ---------------------------------------------------------------------------
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '2 days',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '5 days',
        date = CURRENT_DATE + INTERVAL '14 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '14 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '14 days'))::INT,
        status = 'active'
    WHERE workshop_id = v_tech2_id AND class_code = 'A';

    ---------------------------------------------------------------------------
    -- SCENARIO 3: REGISTRATION ENDED (CLOSED)
    -- Workshop: Intro to Golang (Class A)
    -- Status: Active (but reg closed)
    -- Date: 3 Days from now
    -- Reg: Ended yesterday
    ---------------------------------------------------------------------------
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '10 days',
        registration_end = CURRENT_TIMESTAMP - INTERVAL '1 day',
        date = CURRENT_DATE + INTERVAL '3 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '3 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '3 days'))::INT,
        status = 'active'
    WHERE workshop_id = v_tech1_id AND class_code = 'A';

    ---------------------------------------------------------------------------
    -- SCENARIO 4: COMPLETED WORKSHOP (HISTORY)
    -- Workshop: Digital Marketing (Class A)
    -- Status: Done
    -- Date: 1 Month ago
    -- Action: Mark as 'done' and enroll student for history testing
    ---------------------------------------------------------------------------
    -- 4a. Update Session
    UPDATE workshop_sessions 
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '40 days',
        registration_end = CURRENT_TIMESTAMP - INTERVAL '35 days',
        date = CURRENT_DATE - INTERVAL '30 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '30 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '30 days'))::INT,
        status = 'done'
    WHERE workshop_id = v_biz_id AND class_code = 'A'
    RETURNING id INTO v_completed_session_id;

    -- 4b. Enroll Student (if not already enrolled)
    IF v_student_id IS NOT NULL AND v_completed_session_id IS NOT NULL THEN
        INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
        VALUES (
            gen_random_uuid(),
            v_student_id,
            v_completed_session_id,
            'ACTIVE',
            NOW() - INTERVAL '38 days', -- Enrolled back then
            NULL, -- Enable user to rate it now
            NULL,
            NULL
        )
        ON CONFLICT (student_id, class_id) DO NOTHING;
    END IF;

    -- Note: No need to manually update schedules.day_of_week here.
    -- The trigger installed by V10 (trigger_sync_schedule_day) handles this automatically
    -- whenever workshop_sessions.date is updated.

END $$;
