-- Diagnostic SQL Queries for Seat Selection UUID Error
-- Run these queries to identify data issues

-- 1. Check for invalid workshop session IDs
SELECT 
    'Invalid Session IDs' as check_name,
    COUNT(*) as count
FROM workshop_sessions 
WHERE id IS NULL OR id::text = '';

-- 2. Verify all workshop sessions with seats enabled have valid data
SELECT 
    c.name as workshop_name,
    cl.id as session_id,
    cl.class_code,
    cl.seats_enabled,
    cl.quota,
    (SELECT COUNT(*) FROM seats s WHERE s.workshop_session_id = cl.id) as seat_count,
    CASE 
        WHEN cl.id IS NULL THEN 'NULL ID'
        WHEN cl.id::text = '' THEN 'EMPTY ID'
        WHEN LENGTH(cl.id::text) != 36 THEN 'INVALID UUID LENGTH'
        ELSE 'OK'
    END as id_status
FROM workshops c
JOIN workshop_sessions cl ON c.id = cl.workshop_id
WHERE cl.seats_enabled = true
ORDER BY id_status DESC, c.name;

-- 3. Find workshops with seats enabled but no seats created
SELECT 
    c.name as workshop_name,
    cl.id as session_id,
    cl.class_code,
    cl.seats_enabled,
    (SELECT COUNT(*) FROM seats s WHERE s.workshop_session_id = cl.id) as seat_count
FROM workshops c
JOIN workshop_sessions cl ON c.id = cl.workshop_id
WHERE cl.seats_enabled = true
  AND (SELECT COUNT(*) FROM seats s WHERE s.workshop_session_id = cl.id) = 0;

-- 4. Sample valid workshop sessions for comparison
SELECT 
    c.name as workshop_name,
    cl.id as session_id,
    cl.class_code,
    cl.seats_enabled,
    LENGTH(cl.id::text) as id_length
FROM workshops c
JOIN workshop_sessions cl ON c.id = cl.workshop_id
LIMIT 5;

-- 5. Check seat data integrity
SELECT 
    s.id as seat_id,
    s.workshop_session_id,
    s.seat_number,
    s.status,
    ws.class_code,
    CASE 
        WHEN s.workshop_session_id IS NULL THEN 'NULL SESSION ID'
        WHEN s.workshop_session_id::text = '' THEN 'EMPTY SESSION ID'
        WHEN ws.id IS NULL THEN 'ORPHANED SEAT (no matching session)'
        ELSE 'OK'
    END as integrity_status
FROM seats s
LEFT JOIN workshop_sessions ws ON s.workshop_session_id = ws.id
WHERE s.workshop_session_id IS NULL 
   OR s.workshop_session_id::text = ''
   OR ws.id IS NULL
LIMIT 10;

-- 6. Get the exact query that the backend uses (for debugging)
SELECT c.id, cl.id, c.code, c.name, c.credits, c.faculty,
       cl.quota, 
       (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cl.id AND e.status = 'ACTIVE') as enrolled_count, 
       u.name as mentor_name,
       COALESCE(string_agg(substring(sch.day_of_week, 1, 3) || ' ' || substring(sch.start_time::text, 1, 5) || '-' || substring(sch.end_time::text, 1, 5), ', '), '') as schedule,
       COALESCE(MAX(sch.room), 'TBD') as room,
       cl.seats_enabled
FROM workshops c
JOIN workshop_sessions cl ON c.id = cl.workshop_id
JOIN semesters s ON cl.semester_id = s.id
JOIN mentors l ON cl.mentor_id = l.id
JOIN users u ON l.user_id = u.id
LEFT JOIN schedules sch ON cl.id = sch.class_id
WHERE s.code = '2023/2024-GASAL'
  AND ('' = '' OR c.faculty = '')
GROUP BY c.id, cl.id, u.name, cl.seats_enabled
LIMIT 20;
