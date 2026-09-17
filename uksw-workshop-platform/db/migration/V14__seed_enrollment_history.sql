-- V14: Seed Rich Enrollment History Data
-- Seeds completed workshop enrollments for multiple students,
-- some with ratings already filled in, so the History page has real data to display.
-- Uses the same workshop sessions set up in V9/V13 (Digital Marketing done, UI/UX to be marked done here).

DO $$
DECLARE
    -- Student user IDs
    v_s1_id UUID; -- Alex Nugroho      672019001
    v_s2_id UUID; -- Maria Santos      672019002
    v_s3_id UUID; -- Budi Santoso      672019003
    v_s4_id UUID; -- Siti Rahayu       672019004
    v_s5_id UUID; -- Rudi Hartono      672019005
    v_s6_id UUID; -- Dewi Lestari      672019006

    -- Workshop session IDs
    v_biz_session_id   UUID;  -- Digital Marketing (already 'done' from V13)
    v_create_session_id UUID; -- UI/UX Design Fundamentals — will mark 'done' here
    v_tech1_session_id UUID;  -- Intro to Golang Class B — will mark 'done' here
BEGIN
    -- ── Resolve student IDs ──────────────────────────────────────────────────
    SELECT s.id INTO v_s1_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019001';
    SELECT s.id INTO v_s2_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019002';
    SELECT s.id INTO v_s3_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019003';
    SELECT s.id INTO v_s4_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019004';
    SELECT s.id INTO v_s5_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019005';
    SELECT s.id INTO v_s6_id FROM students s JOIN users u ON s.user_id = u.id WHERE u.nim_nidn = '672019006';

    -- ── Resolve session IDs ──────────────────────────────────────────────────
    SELECT ws.id INTO v_biz_session_id
    FROM workshop_sessions ws
    JOIN workshops w ON ws.workshop_id = w.id
    WHERE w.code = 'WS_BIZ_01' AND ws.class_code = 'A';

    SELECT ws.id INTO v_create_session_id
    FROM workshop_sessions ws
    JOIN workshops w ON ws.workshop_id = w.id
    WHERE w.code = 'WS_CREATE_01' AND ws.class_code = 'A';

    SELECT ws.id INTO v_tech1_session_id
    FROM workshop_sessions ws
    JOIN workshops w ON ws.workshop_id = w.id
    WHERE w.code = 'WS_TECH_01' AND ws.class_code = 'B';

    -- ── Mark UI/UX and Golang Class B sessions as 'done' with past dates ─────
    UPDATE workshop_sessions
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '55 days',
        registration_end   = CURRENT_TIMESTAMP - INTERVAL '50 days',
        date               = CURRENT_DATE - INTERVAL '45 days',
        month              = EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '45 days'))::INT,
        year               = EXTRACT(YEAR  FROM (CURRENT_DATE - INTERVAL '45 days'))::INT,
        status             = 'done'
    WHERE id = v_create_session_id;

    UPDATE workshop_sessions
    SET registration_start = CURRENT_TIMESTAMP - INTERVAL '70 days',
        registration_end   = CURRENT_TIMESTAMP - INTERVAL '65 days',
        date               = CURRENT_DATE - INTERVAL '60 days',
        month              = EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '60 days'))::INT,
        year               = EXTRACT(YEAR  FROM (CURRENT_DATE - INTERVAL '60 days'))::INT,
        status             = 'done'
    WHERE id = v_tech1_session_id;

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENROLLMENTS — Digital Marketing (WS_BIZ_01 Class A) — already done ─
    -- Student 1 (Alex) already enrolled via V13. Add more students + ratings.
    -- ═══════════════════════════════════════════════════════════════════════

    -- Alex (s1) — update to be UNRATED (Available to rate)
    UPDATE enrollments
    SET rating   = NULL,
        review   = NULL,
        rated_at = NULL
    WHERE student_id = v_s1_id AND class_id = v_biz_session_id;

    -- Maria (s2) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s2_id, v_biz_session_id, 'ACTIVE',
            NOW() - INTERVAL '37 days', 4, 'Good content but could use more case studies.', NOW() - INTERVAL '27 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Budi (s3) — enrolled, not yet rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s3_id, v_biz_session_id, 'ACTIVE',
            NOW() - INTERVAL '36 days', NULL, NULL, NULL)
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Siti (s4) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s4_id, v_biz_session_id, 'ACTIVE',
            NOW() - INTERVAL '36 days', 3, 'Average. The topics were okay but delivery was slow.', NOW() - INTERVAL '26 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENROLLMENTS — UI/UX Design Fundamentals (WS_CREATE_01 Class A) — done
    -- ═══════════════════════════════════════════════════════════════════════

    -- Alex (s1) — enrolled, NOT rated (Available to rate)
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s1_id, v_create_session_id, 'ACTIVE',
            NOW() - INTERVAL '50 days', NULL, NULL, NULL)
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Maria (s2) — enrolled, not yet rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s2_id, v_create_session_id, 'ACTIVE',
            NOW() - INTERVAL '49 days', NULL, NULL, NULL)
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Rudi (s5) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s5_id, v_create_session_id, 'ACTIVE',
            NOW() - INTERVAL '49 days', 4, 'Great hands-on projects. Would recommend.', NOW() - INTERVAL '39 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Dewi (s6) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s6_id, v_create_session_id, 'ACTIVE',
            NOW() - INTERVAL '48 days', 5, 'Outstanding! The mentor was very engaging.', NOW() - INTERVAL '38 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- ═══════════════════════════════════════════════════════════════════════
    -- ENROLLMENTS — Intro to Golang Class B (WS_TECH_01 Class B) — done
    -- ═══════════════════════════════════════════════════════════════════════

    -- Alex (s1) — enrolled, NOT rated (Available to rate)
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s1_id, v_tech1_session_id, 'ACTIVE',
            NOW() - INTERVAL '65 days', NULL, NULL, NULL)
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Budi (s3) — enrolled, not yet rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s3_id, v_tech1_session_id, 'ACTIVE',
            NOW() - INTERVAL '64 days', NULL, NULL, NULL)
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Rudi (s5) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s5_id, v_tech1_session_id, 'ACTIVE',
            NOW() - INTERVAL '63 days', 5, 'Best workshop I have attended. Highly recommended!', NOW() - INTERVAL '53 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

    -- Dewi (s6) — enrolled + rated
    INSERT INTO enrollments (id, student_id, class_id, status, enrolled_at, rating, review, rated_at)
    VALUES (gen_random_uuid(), v_s6_id, v_tech1_session_id, 'ACTIVE',
            NOW() - INTERVAL '62 days', 4, 'Very informative. Loved the microservices section.', NOW() - INTERVAL '52 days')
    ON CONFLICT (student_id, class_id) DO NOTHING;

END $$;
