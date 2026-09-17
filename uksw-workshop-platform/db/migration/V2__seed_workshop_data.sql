-- V2: Seed Workshop Platform Data
-- Populates the database with sample users, workshops, and sessions

-- Insert sample semester
INSERT INTO semesters (code, name, start_date, end_date, is_registration_open) VALUES
('GASAL_2024', 'Workshop Season 2024', '2024-09-01', '2025-01-31', TRUE),
('GENAP_2025', 'Workshop Season 2025', '2025-02-01', '2025-07-31', FALSE);

-- Insert sample users (using plaintext passwords for development)
-- Password: password123
-- Mentors are auto-approved by trigger, students need manual approval (but we'll approve them in seed data)
INSERT INTO users (nim_nidn, name, email, password_hash, role, approved, approval_status) VALUES
-- Students (10 users)
('672019001', 'Alex Nugroho', 'alex.nugroho@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019002', 'Maria Santos', 'maria.santos@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019003', 'Budi Santoso', 'budi.santoso@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019004', 'Siti Rahayu', 'siti.rahayu@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019005', 'Rudi Hartono', 'rudi.hartono@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019006', 'Dewi Lestari', 'dewi.lestari@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019007', 'Ahmad Fauzi', 'ahmad.fauzi@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019008', 'Rina Wijaya', 'rina.wijaya@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019009', 'Andi Pratama', 'andi.pratama@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
('672019010', 'Lina Kusuma', 'lina.kusuma@student.uksw.edu', 'password123', 'STUDENT', true, 'APPROVED'),
-- Mentors (auto-approved by trigger)
('1987654321', 'Dr. John Smith', 'john.smith@uksw.edu', 'password123', 'MENTOR', true, 'APPROVED'),
('1987654322', 'Dr. Jane Doe', 'jane.doe@uksw.edu', 'password123', 'MENTOR', true, 'APPROVED');

-- Insert students
INSERT INTO students (user_id, major, semester, gpa, max_credits)
SELECT id, 'Computer Science', 5, 3.50, 24 FROM users WHERE nim_nidn = '672019001'
UNION ALL
SELECT id, 'Information Systems', 3, 3.75, 24 FROM users WHERE nim_nidn = '672019002'
UNION ALL
SELECT id, 'Computer Science', 7, 3.25, 24 FROM users WHERE nim_nidn = '672019003'
UNION ALL
SELECT id, 'Information Technology', 4, 3.60, 24 FROM users WHERE nim_nidn = '672019004'
UNION ALL
SELECT id, 'Computer Science', 6, 3.40, 24 FROM users WHERE nim_nidn = '672019005'
UNION ALL
SELECT id, 'Information Systems', 2, 3.80, 24 FROM users WHERE nim_nidn = '672019006'
UNION ALL
SELECT id, 'Software Engineering', 5, 3.55, 24 FROM users WHERE nim_nidn = '672019007'
UNION ALL
SELECT id, 'Computer Science', 3, 3.70, 24 FROM users WHERE nim_nidn = '672019008'
UNION ALL
SELECT id, 'Information Technology', 7, 3.30, 24 FROM users WHERE nim_nidn = '672019009'
UNION ALL
SELECT id, 'Information Systems', 4, 3.65, 24 FROM users WHERE nim_nidn = '672019010';

-- Insert mentors
INSERT INTO mentors (user_id, department, title, max_concurrent_students)
SELECT id, 'Computer Science', 'Ph.D.', 20 FROM users WHERE nim_nidn = '1987654321'
UNION ALL
SELECT id, 'Information Systems', 'Ph.D.', 5 FROM users WHERE nim_nidn = '1987654322';

-- Insert workshops
INSERT INTO workshops (code, name, credits, faculty, description, workshop_type) VALUES
('WS_TECH_01', 'Intro to Golang & Microservices', 4, 'Faculty of Computer Science', 'Learn how to build scalable backend systems.', 'Technical'),
('WS_TECH_02', 'React & Modern Frontend', 4, 'Faculty of Computer Science', 'Master React, Vite, and Tailwind CSS.', 'Technical'),
('WS_BIZ_01', 'Digital Marketing Strategy', 2, 'Faculty of Business', 'Marketing in the digital age.', 'Business'),
('WS_CREATE_01', 'UI/UX Design Fundamentals', 3, 'Faculty of Arts', 'Designing intuitive user interfaces.', 'Creative'),
('WS_LEAD_01', 'Leadership in Tech', 2, 'Faculty of Interdisciplinary', 'Soft skills for engineering leaders.', 'Leadership');

-- Get mentor IDs for class assignment
DO $$
DECLARE
    mentor1_id UUID;
    mentor2_id UUID;
    v_semester_id UUID;
    tech1_id UUID;
    tech2_id UUID;
    biz1_id UUID;
    create1_id UUID;
    lead1_id UUID;
BEGIN
    SELECT id INTO mentor1_id FROM mentors WHERE user_id = (SELECT id FROM users WHERE nim_nidn = '1987654321');
    SELECT id INTO mentor2_id FROM mentors WHERE user_id = (SELECT id FROM users WHERE nim_nidn = '1987654322');
    SELECT id INTO v_semester_id FROM semesters WHERE code = 'GASAL_2024';
    
    SELECT id INTO tech1_id FROM workshops WHERE code = 'WS_TECH_01';
    SELECT id INTO tech2_id FROM workshops WHERE code = 'WS_TECH_02';
    SELECT id INTO biz1_id FROM workshops WHERE code = 'WS_BIZ_01';
    SELECT id INTO create1_id FROM workshops WHERE code = 'WS_CREATE_01';
    SELECT id INTO lead1_id FROM workshops WHERE code = 'WS_LEAD_01';

    -- Insert workshop sessions
    -- Quota small for testing queue
    INSERT INTO workshop_sessions (workshop_id, semester_id, mentor_id, class_code, quota, enrolled_count, seats_enabled) VALUES
    (tech1_id, v_semester_id, mentor1_id, 'A', 50, 0, true),
    (tech1_id, v_semester_id, mentor1_id, 'B', 50, 0, true),
    (tech2_id, v_semester_id, mentor1_id, 'A', 40, 0, true),
    (biz1_id, v_semester_id, mentor2_id, 'A', 45, 0, true),
    (create1_id, v_semester_id, mentor1_id, 'A', 35, 0, true),
    (lead1_id, v_semester_id, mentor2_id, 'A', 60, 0, true);

    -- Insert schedules
    INSERT INTO schedules (class_id, day_of_week, start_time, end_time, room)
    SELECT id, 'MONDAY', '08:00'::TIME, '10:00'::TIME, 'Lab 101' FROM workshop_sessions WHERE workshop_id = tech1_id AND class_code = 'A'
    UNION ALL
    SELECT id, 'TUESDAY', '10:00'::TIME, '12:00'::TIME, 'Lab 102' FROM workshop_sessions WHERE workshop_id = tech1_id AND class_code = 'B'
    UNION ALL
    SELECT id, 'WEDNESDAY', '13:00'::TIME, '16:00'::TIME, 'Lab 103' FROM workshop_sessions WHERE workshop_id = tech2_id
    UNION ALL
    SELECT id, 'THURSDAY', '09:00'::TIME, '11:00'::TIME, 'Room 201' FROM workshop_sessions WHERE workshop_id = biz1_id
    UNION ALL
    SELECT id, 'FRIDAY', '13:00'::TIME, '15:00'::TIME, 'Studio 1' FROM workshop_sessions WHERE workshop_id = create1_id
    UNION ALL
    SELECT id, 'SATURDAY', '09:00'::TIME, '11:00'::TIME, 'Hall A' FROM workshop_sessions WHERE workshop_id = lead1_id;
    
    -- Generate seats for all sessions based on their quota
    -- The function auto-calculates optimal layout from quota
    PERFORM generate_seats_for_session(id) 
    FROM workshop_sessions 
    WHERE semester_id = v_semester_id;

END $$;
