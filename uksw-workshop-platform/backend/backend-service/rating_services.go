package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// RateWorkshop allows a student to rate a completed workshop
func RateWorkshop(ctx context.Context, userId, enrollmentId string, rating int, review string) error {
	ctx, span := tracer.Start(ctx, "RateWorkshop")
	defer span.End()

	// 1. Verify enrollment exists, belongs to user, and fetch workshop date
	var workshopDateStr sql.NullString
	var currentStatus string

	// Join all necessary tables to get date
	err := db.QueryRowContext(ctx, `
		SELECT 
			to_char(ws.date, 'YYYY-MM-DD'),
			e.status
		FROM enrollments e
		JOIN students s ON e.student_id = s.id
		JOIN workshop_sessions ws ON e.class_id = ws.id
		WHERE e.id = $1 AND s.user_id = $2
	`, enrollmentId, userId).Scan(&workshopDateStr, &currentStatus)

	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("ENROLLMENT_NOT_FOUND")
		}
		return err
	}

	// 2. Check Status and Date validity
	if currentStatus != "ACTIVE" {
		return errors.New("ENROLLMENT_NOT_ACTIVE_CANNOT_RATE")
	}

	if !workshopDateStr.Valid {
		return errors.New("WORKSHOP_HAS_NO_DATE_CANNOT_RATE")
	}

	workshopDate, err := time.Parse("2006-01-02", workshopDateStr.String)
	if err != nil {
		return fmt.Errorf("invalid workshop date format in DB: %v", err)
	}

	// 3. Logic: User can rate if Today >= Workshop Date (start of day)
	// We allow rating on the day of the workshop to encourage immediate feedback.

	now := time.Now()
	// Check if workshop happens in future (strictly after today)
	// Truncate 'now' to start of day for fairer comparison?
	// Or just keep simple: if Workshop Date (which is 00:00) is after Now.
	// Actually, workshopDate is YYYY-MM-DD 00:00:00.
	// If today is Feb 19 10:00, workshop is Feb 19.
	// Is Feb 19 (00:00) after Feb 19 (10:00)? No.
	// So we can rate.
	// If workshop is Feb 20. Feb 20 (00:00) After Feb 19 (10:00)? Yes.
	// So we cannot rate. Correct.
	if workshopDate.After(now) {
		return errors.New("WORKSHOP_NOT_STARTED_YET")
	}

	// 4. Update Rating
	result, err := db.ExecContext(ctx, `
		UPDATE enrollments 
		SET rating = $1, review = $2, rated_at = NOW()
		WHERE id = $3
	`, rating, review, enrollmentId)

	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("UPDATE_FAILED_NO_ROWS_AFFECTED")
	}

	return nil
}

// GetStudentEnrollmentHistory returns all past/completed workshops with rating info
func GetStudentEnrollmentHistory(ctx context.Context, userId string) ([]Enrollment, error) {
	ctx, span := tracer.Start(ctx, "GetStudentEnrollmentHistory")
	defer span.End()

	// Select history where workshop date is in the past OR status is completed/graded
	// We filter by 'ACTIVE' status to ignore dropped courses.
	// We return ALL active enrollments, the frontend/logic determines if they are "completed" based on date.

	query := `
		SELECT 
			e.id, 
			c.code, 
			c.name, 
			c.credits, 
			to_char(e.enrolled_at, 'YYYY-MM-DD HH24:MI:SS'), 
			u.name as mentor_name, 
			cl.id as session_id,
			to_char(cl.date, 'YYYY-MM-DD') as workshop_date,
			COALESCE(e.rating, 0),
			COALESCE(e.review, ''),
			COALESCE(to_char(e.rated_at, 'YYYY-MM-DD HH24:MI:SS'), '')
		FROM enrollments e
		JOIN students s ON e.student_id = s.id
		JOIN workshop_sessions cl ON e.class_id = cl.id
		JOIN workshops c ON cl.workshop_id = c.id
		JOIN mentors l ON cl.mentor_id = l.id
		JOIN users u ON l.user_id = u.id
		WHERE s.user_id = $1
		AND e.status = 'ACTIVE'
		ORDER BY cl.date DESC, e.enrolled_at DESC
	`

	rows, err := db.QueryContext(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []Enrollment
	now := time.Now()

	for rows.Next() {
		var e Enrollment
		var enrolledAt string // Temporary string to parse later if needed, or pass through
		var dateStr sql.NullString
		var rating int
		var review, ratedAt string

		err := rows.Scan(
			&e.ID,
			&e.WorkshopCode,
			&e.WorkshopName,
			&e.Credits,
			&enrolledAt,
			&e.Mentor,
			&e.SessionID,
			&dateStr,
			&rating,
			&review,
			&ratedAt,
		)
		if err != nil {
			return nil, err
		}

		e.EnrolledAt = enrolledAt
		e.Date = dateStr.String
		e.Rating = rating
		e.Review = review
		e.RatedAt = ratedAt

		// Determine completion status
		if dateStr.Valid {
			wDate, _ := time.Parse("2006-01-02", dateStr.String)
			// Completed if workshop date is today or present/past
			if !wDate.After(now) {
				e.IsCompleted = true
			}
		}

		// Fetch Schedule (Optional for history, but good for context)
		// We can skip detailed schedule query for history to save perf, or include it.
		// Let's include basic schedule string if needed, but the query didn't fetch it.
		// For history, usually just Date is enough.

		history = append(history, e)
	}

	return history, nil
}

// WorkshopFeedback holds aggregate feedback for a single workshop session
type WorkshopFeedback struct {
	SessionID     string        `json:"sessionId"`
	WorkshopName  string        `json:"workshopName"`
	WorkshopCode  string        `json:"workshopCode"`
	TotalRatings  int           `json:"totalRatings"`
	AverageRating float64       `json:"averageRating"`
	Reviews       []ReviewEntry `json:"reviews"`
}

// ReviewEntry holds a single student review
type ReviewEntry struct {
	StudentName string `json:"studentName"`
	Rating      int    `json:"rating"`
	Review      string `json:"review"`
	RatedAt     string `json:"ratedAt"`
}

// MentorFeedbackSummary holds the overall feedback summary for a mentor
type MentorFeedbackSummary struct {
	TotalRatings int                `json:"totalRatings"`
	OverallAvg   float64            `json:"overallAverage"`
	Workshops    []WorkshopFeedback `json:"workshops"`
}

// GetMentorFeedbackSummary returns aggregate student feedback for all workshops owned by this mentor
func GetMentorFeedbackSummary(ctx context.Context, mentorUserID string) (*MentorFeedbackSummary, error) {
	ctx, span := tracer.Start(ctx, "GetMentorFeedbackSummary")
	defer span.End()

	query := `
		SELECT
			ws.id as session_id,
			w.code as workshop_code,
			w.name as workshop_name,
			u_student.name as student_name,
			e.rating,
			COALESCE(e.review, '') as review,
			COALESCE(to_char(e.rated_at, 'YYYY-MM-DD HH24:MI'), '') as rated_at
		FROM enrollments e
		JOIN workshop_sessions ws ON e.class_id = ws.id
		JOIN workshops w ON ws.workshop_id = w.id
		JOIN mentors m ON ws.mentor_id = m.id
		JOIN users u_mentor ON m.user_id = u_mentor.id
		JOIN students s ON e.student_id = s.id
		JOIN users u_student ON s.user_id = u_student.id
		WHERE u_mentor.id = $1
		AND e.rating IS NOT NULL
		AND e.status = 'ACTIVE'
		ORDER BY ws.id, e.rated_at DESC
	`

	rows, err := db.QueryContext(ctx, query, mentorUserID)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	// Group by session
	sessionMap := make(map[string]*WorkshopFeedback)
	sessionOrder := []string{}

	for rows.Next() {
		var sessionID, code, name, studentName, review, ratedAt string
		var rating int
		if err := rows.Scan(&sessionID, &code, &name, &studentName, &rating, &review, &ratedAt); err != nil {
			return nil, err
		}

		if _, exists := sessionMap[sessionID]; !exists {
			sessionMap[sessionID] = &WorkshopFeedback{
				SessionID:    sessionID,
				WorkshopCode: code,
				WorkshopName: name,
				Reviews:      []ReviewEntry{},
			}
			sessionOrder = append(sessionOrder, sessionID)
		}

		sessionMap[sessionID].TotalRatings++
		sessionMap[sessionID].Reviews = append(sessionMap[sessionID].Reviews, ReviewEntry{
			StudentName: studentName,
			Rating:      rating,
			Review:      review,
			RatedAt:     ratedAt,
		})
	}

	// Compute averages
	summary := &MentorFeedbackSummary{Workshops: []WorkshopFeedback{}}
	totalRatingSum := 0
	totalRatingCount := 0

	for _, sessionID := range sessionOrder {
		wf := sessionMap[sessionID]
		ratingSum := 0
		for _, r := range wf.Reviews {
			ratingSum += r.Rating
		}
		if wf.TotalRatings > 0 {
			wf.AverageRating = float64(ratingSum) / float64(wf.TotalRatings)
		}
		totalRatingSum += ratingSum
		totalRatingCount += wf.TotalRatings
		summary.Workshops = append(summary.Workshops, *wf)
	}

	summary.TotalRatings = totalRatingCount
	if totalRatingCount > 0 {
		summary.OverallAvg = float64(totalRatingSum) / float64(totalRatingCount)
	}

	return summary, nil
}
