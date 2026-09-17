-- V16: Seed Active Workshop Enrollments
-- Enrolls a set of students into the currently "open" workshop sessions
-- (React & Modern Frontend Class A, Leadership in Tech Class A)
-- so the student enrollment page and queue system have real data to display.
-- All inserts use ON CONFLICT DO NOTHING, so the migration is safe to replay.

DO $$
DECLARE
    -- Student IDs
    v_s1_id  UUID; -- Alex Nugroho      672019001
    v_s2_id  UUID; -- Maria Santos      672019002
    v_s3_id  UUID; -- Budi Santoso      672019003
    v_s4_id  UUID; -- Siti Rahayu       672019004
    v_s5_id  UUID; -- Rudi Hartono      672019005
    v_s7_id  UUID; -- Ahmad Fauzi       672019007
    v_s8_id  UUID; -- Rina Wijaya       672019008

    -- Session IDs
    v_tech2_session_id UUID;  -- React & Modern Frontend Class A
    v_lead_session_id  UUID;  -- Leadership in Tech Class A

BEGIN
    -- Resolve student IDs from users table
    SELECT s.id INTO v_s1_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019001';
    SELECT s.id INTO v_s2_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019002';
    SELECT s.id INTO v_s3_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019003';
    SELECT s.id INTO v_s4_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019004';
    SELECT s.id INTO v_s5_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019005';
    SELECT s.id INTO v_s7_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019007';
    SELECT s.id INTO v_s8_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019008';

    -- Resolve session IDs
    SELECT ws.id INTO v_tech2_session_id
    FROM workshop_sessions ws
    JOIN workshops w ON ws.workshop_id = w.id
    WHERE w.code = 'WS_TECH_02' AND ws.class_code = 'A';

    SELECT ws.id INTO v_lead_session_id
    FROM workshop_sessions ws
    JOIN workshops w ON ws.workshop_id = w.id
    WHERE w.code = 'WS_LEAD_01' AND ws.class_code = 'A';

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENROLLMENTS — React & Modern Frontend (WS_TECH_02 Class A) — Open
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s1_id, v_tech2_session_id, 'ACTIVE', NOW() - INTERVAL '1 day')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s2_id, v_tech2_session_id, 'ACTIVE', NOW() - INTERVAL '1 day')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s3_id, v_tech2_session_id, 'ACTIVE', NOW() - INTERVAL '12 hours')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s4_id, v_tech2_session_id, 'ACTIVE', NOW() - INTERVAL '10 hours')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s7_id, v_tech2_session_id, 'ACTIVE', NOW() - INTERVAL '6 hours')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Update enrolled_count for React session
    UPDATE workshop_sessions
    SET enrolled_count = (
        SELECT COUNT(*) FROM enrollments
        WHERE class_id = v_tech2_session_id AND status = 'ACTIVE'
    )
    WHERE id = v_tech2_session_id;

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENROLLMENTS — Leadership in Tech (WS_LEAD_01 Class A) — Upcoming
    -- Registration hasn't opened yet, so pre-seed a few interested students
    -- with status PENDING (waiting for reg to open) to simulate interest.
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s5_id, v_lead_session_id, 'ACTIVE', NOW() - INTERVAL '2 hours')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at)
    VALUES (gen_random_uuid(), v_s8_id, v_lead_session_id, 'ACTIVE', NOW() - INTERVAL '1 hour')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Update enrolled_count for Leadership session
    UPDATE workshop_sessions
    SET enrolled_count = (
        SELECT COUNT(*) FROM enrollments
        WHERE class_id = v_lead_session_id AND status = 'ACTIVE'
    )
    WHERE id = v_lead_session_id;

END $$;
