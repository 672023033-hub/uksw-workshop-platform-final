package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"go.opentelemetry.io/otel/attribute"
)

// UpdateStudentCreditLimit allows a mentor to update a student's max credit limit
func UpdateStudentCreditLimit(ctx context.Context, mentorUserId, studentUserId string, newLimit int) error {
	ctx, span := tracer.Start(ctx, "UpdateStudentCreditLimit")
	defer span.End()
	span.SetAttributes(
		attribute.String("mentor.user_id", mentorUserId),
		attribute.String("student.user_id", studentUserId),
		attribute.Int("new_limit", newLimit),
	)

	// Validate limit
	if newLimit < 0 || newLimit > 30 {
		return errors.New("INVALID_CREDIT_LIMIT: must be between 0 and 30")
	}

	// Update student max_credits
	result, err := db.ExecContext(ctx, `
		UPDATE students
		SET max_credits = $1
		WHERE user_id = $2
	`, newLimit, studentUserId)

	if err != nil {
		span.RecordError(err)
		return fmt.Errorf("failed to update credit limit: %v", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("STUDENT_NOT_FOUND")
	}

	log.Printf("Mentor %s updated credit limit for student %s to %d", mentorUserId, studentUserId, newLimit)
	return nil
}

// Get all students (for mentor to manage credit limits)
func GetAllStudents(ctx context.Context, mentorUserId string) ([]map[string]interface{}, error) {
	ctx, span := tracer.Start(ctx, "GetAllStudents")
	defer span.End()

	rows, err := db.QueryContext(ctx, `
		SELECT 
			u.id as user_id,
			u.nim_nidn as nim,
			u.name,
			u.email,
			s.major,
			s.semester,
			s.max_credits,
			s.gpa,
			COALESCE(
				(SELECT COUNT(*) FROM enrollments e 
				 JOIN students st ON e.student_id = st.id 
				 WHERE st.user_id = u.id AND e.status = 'ACTIVE'),
				0
			) as enrolled_count,
			COALESCE(
				(SELECT string_agg(w.name || ' (' || w.credits || ' Credits)', ', ' ORDER BY w.name)
				 FROM enrollments e
				 JOIN students st ON e.student_id = st.id
				 JOIN workshop_sessions ws ON e.class_id = ws.id
				 JOIN workshops w ON ws.workshop_id = w.id
				 WHERE st.user_id = u.id AND e.status = 'ACTIVE'),
				''
			) as workshops_list
		FROM users u
		JOIN students s ON u.id = s.user_id
		WHERE u.role = 'STUDENT' AND u.approved = true
		ORDER BY u.name
	`)

	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	defer rows.Close()

	var students []map[string]interface{}
	for rows.Next() {
		var userId, nim, name, email, major string
		var semester, maxCredits, enrolledCount int
		var gpa float64
		var workshopsList string

		err := rows.Scan(&userId, &nim, &name, &email, &major, &semester, &maxCredits, &gpa, &enrolledCount, &workshopsList)
		if err != nil {
			continue
		}

		students = append(students, map[string]interface{}{
			"userId":        userId,
			"nim":           nim,
			"name":          name,
			"email":         email,
			"major":         major,
			"semester":      semester,
			"maxCredits":    maxCredits,
			"gpa":           gpa,
			"enrolledCount": enrolledCount,
			"workshopsList": workshopsList,
		})
	}

	return students, nil
}
