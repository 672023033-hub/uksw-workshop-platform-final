-- V14: Add Rating and Review to Enrollments
-- Allows students to rate workshops they have completed

ALTER TABLE enrollments
ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5),
ADD COLUMN review TEXT,
ADD COLUMN rated_at TIMESTAMP WITH TIME ZONE;

-- Add index for querying ratings
CREATE INDEX idx_enrollments_rating ON enrollments(rating);
