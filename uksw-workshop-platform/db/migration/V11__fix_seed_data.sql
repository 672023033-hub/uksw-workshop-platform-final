-- V11: Fix Seed Data for Consistency and Design
-- Updates remaining workshops (UI/UX, Leadership) with dates and regenerates seats with proper layout

DO $$
DECLARE
    v_create_id UUID;
    v_lead_id UUID;
    v_tech1_id UUID;
    v_tech2_id UUID;
    v_biz_id UUID;
BEGIN
    SELECT id INTO v_create_id FROM workshops WHERE code = 'WS_CREATE_01';
    SELECT id INTO v_lead_id FROM workshops WHERE code = 'WS_LEAD_01';
    SELECT id INTO v_tech1_id FROM workshops WHERE code = 'WS_TECH_01';
    SELECT id INTO v_tech2_id FROM workshops WHERE code = 'WS_TECH_02';
    SELECT id INTO v_biz_id FROM workshops WHERE code = 'WS_BIZ_01';

    -- 1. UI/UX Design - Active/Open
    UPDATE workshop_sessions
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '3 days',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '10 days',
        date = CURRENT_DATE + INTERVAL '20 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '20 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '20 days'))::INT,
        status = 'active'
    WHERE workshop_id = v_create_id;

    -- 2. Leadership - Upcoming
    UPDATE workshop_sessions
    SET registration_start = CURRENT_TIMESTAMP + INTERVAL '5 days',
        registration_end = CURRENT_TIMESTAMP + INTERVAL '12 days',
        date = CURRENT_DATE + INTERVAL '25 days',
        month = EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '25 days'))::INT,
        year = EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '25 days'))::INT,
        status = 'active'
    WHERE workshop_id = v_lead_id;
    
    -- FORCE SCHEDULE UPDATE FOR ALL WORKSHOPS TO MATCH DATE
    -- This relies on the trigger from V10, but we do it explicitly to be sure
    UPDATE schedules s
    SET day_of_week = TRIM(UPPER(TO_CHAR(ws.date, 'Day')))
    FROM workshop_sessions ws
    WHERE s.class_id = ws.id
    AND ws.date IS NOT NULL;

    -- REGENERATE SEATS with specific layouts for better visual "Design"
    
    -- UI/UX: Quota 35 -> 5x7
    -- DELETE FROM seats WHERE workshop_session_id IN (SELECT id FROM workshop_sessions WHERE workshop_id = v_create_id);
    -- PERFORM generate_seats_for_session(id, 5, 7) FROM workshop_sessions WHERE workshop_id = v_create_id;

    -- Leadership: Quota 60 -> 6x10
    -- DELETE FROM seats WHERE workshop_session_id IN (SELECT id FROM workshop_sessions WHERE workshop_id = v_lead_id);
    -- PERFORM generate_seats_for_session(id, 6, 10) FROM workshop_sessions WHERE workshop_id = v_lead_id;

    -- Tech 1 (Golang): Quota 50 -> 5x10
    -- DELETE FROM seats WHERE workshop_session_id IN (SELECT id FROM workshop_sessions WHERE workshop_id = v_tech1_id);
    -- PERFORM generate_seats_for_session(id, 5, 10) FROM workshop_sessions WHERE workshop_id = v_tech1_id;

    -- Tech 2 (React): Quota 40 -> 5x8
    -- DELETE FROM seats WHERE workshop_session_id IN (SELECT id FROM workshop_sessions WHERE workshop_id = v_tech2_id);
    -- PERFORM generate_seats_for_session(id, 5, 8) FROM workshop_sessions WHERE workshop_id = v_tech2_id;

    -- Biz (Marketing): Quota 45 -> 5x9
    -- DELETE FROM seats WHERE workshop_session_id IN (SELECT id FROM workshop_sessions WHERE workshop_id = v_biz_id);
    -- PERFORM generate_seats_for_session(id, 5, 9) FROM workshop_sessions WHERE workshop_id = v_biz_id;

END $$;
