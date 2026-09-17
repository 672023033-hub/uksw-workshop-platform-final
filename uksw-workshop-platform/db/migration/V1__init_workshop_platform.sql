-- V1: Initialize Workshop Platform Schema
-- Consolidated migration for Workshop Platform transformation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Users & Authentication
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nim_nidn VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('STUDENT', 'MENTOR', 'ADMIN')) NOT NULL,
    approved BOOLEAN DEFAULT FALSE,
    approval_status VARCHAR(20) DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_nim_nidn ON users(nim_nidn);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_approval_status ON users(approval_status);

-- Auto-approve mentors and admins on creation
CREATE OR REPLACE FUNCTION auto_approve_staff()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IN ('MENTOR', 'ADMIN') THEN
        NEW.approved := TRUE;
        NEW.approval_status := 'APPROVED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_approve_staff
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_approve_staff();


CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    major VARCHAR(100),
    semester INT DEFAULT 1,
    gpa DECIMAL(3,2) DEFAULT 0.00,
    max_credits INT DEFAULT 24,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_user ON students(user_id);

CREATE TABLE mentors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    department VARCHAR(100),
    title VARCHAR(50),
    max_concurrent_students INT DEFAULT 2 CHECK (max_concurrent_students > 0), -- From V5
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mentors_user ON mentors(user_id);
COMMENT ON COLUMN mentors.max_concurrent_students IS 'Maximum number of students allowed to access course selection page simultaneously (war mode limit)';

-- ==========================================
-- 2. Workshop Catalog & Sessions
-- ==========================================

CREATE TABLE semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_registration_open BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_semesters_code ON semesters(code);

-- Renamed from 'courses' to 'workshops'
CREATE TABLE workshops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    credits INT NOT NULL CHECK (credits > 0 AND credits <= 6),
    faculty VARCHAR(100),
    description TEXT,
    workshop_type VARCHAR(50) DEFAULT 'General' CHECK (workshop_type IN ('Technical', 'Creative', 'Business', 'Leadership', 'General')), -- From V6
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workshops_code ON workshops(code);
CREATE INDEX idx_workshops_faculty ON workshops(faculty);
CREATE INDEX idx_workshops_type ON workshops(workshop_type);

-- Renamed from 'classes' to 'workshop_sessions'
CREATE TABLE workshop_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID REFERENCES workshops(id) ON DELETE CASCADE NOT NULL, -- Renamed FK
    semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE NOT NULL,
    mentor_id UUID REFERENCES mentors(id) ON DELETE SET NULL,
    class_code VARCHAR(10) NOT NULL,
    quota INT NOT NULL CHECK (quota > 0),
    enrolled_count INT DEFAULT 0 CHECK (enrolled_count >= 0),
    seats_enabled BOOLEAN DEFAULT true, -- From V7
    seat_layout VARCHAR(20) DEFAULT 'STANDARD' CHECK (seat_layout IN ('STANDARD', 'THEATER', 'ROUNDTABLE', 'CUSTOM')), -- From V7
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_enrolled_quota CHECK (enrolled_count <= quota),
    UNIQUE(workshop_id, semester_id, class_code)
);

CREATE INDEX idx_workshop_sessions_workshop ON workshop_sessions(workshop_id);
CREATE INDEX idx_workshop_sessions_semester ON workshop_sessions(semester_id);
CREATE INDEX idx_workshop_sessions_mentor ON workshop_sessions(mentor_id);

CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID REFERENCES workshop_sessions(id) ON DELETE CASCADE NOT NULL, -- Still named class_id internally but refs workshop_sessions
    day_of_week VARCHAR(10) CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_time_order CHECK (start_time < end_time)
);

CREATE INDEX idx_schedules_class ON schedules(class_id);
CREATE INDEX idx_schedules_day ON schedules(day_of_week);

-- ==========================================
-- 3. Enrollments
-- ==========================================

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    class_id UUID REFERENCES workshop_sessions(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'DROPPED', 'WAITLISTED')) DEFAULT 'ACTIVE',
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, class_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_class ON enrollments(class_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
CREATE INDEX idx_enrollments_date ON enrollments(enrolled_at);

-- ==========================================
-- 4. Seat Management (From V7)
-- ==========================================

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_session_id UUID REFERENCES workshop_sessions(id) ON DELETE CASCADE NOT NULL,
    seat_number VARCHAR(10) NOT NULL,
    row_letter VARCHAR(2) NOT NULL,
    column_number INT NOT NULL CHECK (column_number > 0),
    status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED')),
    reserved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reserved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workshop_session_id, seat_number),
    UNIQUE(workshop_session_id, row_letter, column_number)
);

CREATE INDEX idx_seats_workshop_session ON seats(workshop_session_id);
CREATE INDEX idx_seats_status ON seats(status);
CREATE INDEX idx_seats_reserved_by ON seats(reserved_by);

CREATE TABLE workshop_enrollment_seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE NOT NULL,
    seat_id UUID REFERENCES seats(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(enrollment_id),
    UNIQUE(seat_id)
);

CREATE INDEX idx_enrollment_seats_enrollment ON workshop_enrollment_seats(enrollment_id);
CREATE INDEX idx_enrollment_seats_seat ON workshop_enrollment_seats(seat_id);

-- ==========================================
-- 5. Functions & Triggers
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-generate seats for a workshop session based on quota
CREATE OR REPLACE FUNCTION generate_seats_for_session(
    p_session_id UUID
) RETURNS INT AS $$
DECLARE
    v_quota INT;
    v_rows INT;
    v_cols INT;
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
    
    -- Calculate optimal layout (closest to square for better visualization)
    v_cols := CEIL(SQRT(v_quota));
    v_rows := CEIL(v_quota::DECIMAL / v_cols);
    
    -- Generate seats row by row
    FOR i IN 1..v_rows LOOP
        v_row_letter := CHR(64 + i); -- A=65, B=66, etc.
        
        FOR v_col IN 1..v_cols LOOP
            -- Stop if we've reached the exact quota
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

