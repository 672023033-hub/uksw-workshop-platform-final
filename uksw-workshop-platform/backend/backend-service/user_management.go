package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.opentelemetry.io/otel/attribute"
)

// UserWithDetails includes full user information with approval status
type UserWithDetails struct {
	ID             string `json:"id"`
	NIMNIDN        string `json:"nimNidn"`
	Name           string `json:"name"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	Approved       bool   `json:"approved"`
	ApprovalStatus string `json:"approvalStatus"`
	Major          string `json:"major,omitempty"`      // For students only
	MaxCredits     int    `json:"maxCredits,omitempty"` // For students only
	Department     string `json:"department,omitempty"` // For mentors only
	CreatedAt      string `json:"createdAt"`
}

// GetAllUsers returns all users with optional status filter
func GetAllUsers(ctx context.Context, filterStatus string) ([]UserWithDetails, error) {
	ctx, span := tracer.Start(ctx, "GetAllUsers")
	defer span.End()
	span.SetAttributes(attribute.String("filter", filterStatus))

	query := `
		SELECT 
			u.id, u.nim_nidn, u.name, u.email, u.role,
			COALESCE(u.approved, false) as approved,
			COALESCE(u.approval_status, 'PENDING') as approval_status,
			COALESCE(s.major, '') as major,
			COALESCE(s.max_credits, 24) as max_credits,
			COALESCE(m.department, '') as department,
			u.created_at
		FROM users u
		LEFT JOIN students s ON u.id = s.user_id
		LEFT JOIN mentors m ON u.id = m.user_id
	`

	var args []interface{}
	switch filterStatus {
	case "pending":
		query += " WHERE u.approval_status = 'PENDING'"
	case "approved":
		query += " WHERE u.approval_status = 'APPROVED'"
	case "all":
		// No filter
	default:
		// Default to all
	}

	query += " ORDER BY u.created_at DESC"

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		span.RecordError(err)
		return nil, fmt.Errorf("failed to query users: %v", err)
	}
	defer rows.Close()

	var users []UserWithDetails
	for rows.Next() {
		var user UserWithDetails
		var createdAt time.Time
		err := rows.Scan(
			&user.ID,
			&user.NIMNIDN,
			&user.Name,
			&user.Email,
			&user.Role,
			&user.Approved,
			&user.ApprovalStatus,
			&user.Major,
			&user.MaxCredits,
			&user.Department,
			&createdAt,
		)
		if err != nil {
			span.RecordError(err)
			return nil, fmt.Errorf("failed to scan user: %v", err)
		}
		user.CreatedAt = createdAt.Format(time.RFC3339)
		users = append(users, user)
	}

	if users == nil {
		users = []UserWithDetails{}
	}

	log.Printf("[USER MANAGEMENT] Retrieved %d users (filter=%s)", len(users), filterStatus)
	return users, nil
}

// ApproveUser updates a user's approval status to APPROVED
func ApproveUser(ctx context.Context, userId string) error {
	ctx, span := tracer.Start(ctx, "ApproveUser")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))

	query := `
		UPDATE users
		SET approved = true, approval_status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND approval_status = 'PENDING'
	`

	result, err := db.ExecContext(ctx, query, userId)
	if err != nil {
		span.RecordError(err)
		return fmt.Errorf("failed to approve user: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("user not found or already approved")
	}

	log.Printf("[USER MANAGEMENT] Approved user: %s", userId)
	return nil
}

// RejectRemoveUser marks a user as rejected (soft delete approach)
// For pending users: sets approval_status to 'REJECTED'
// For approved users: sets approved to false and approval_status to 'REJECTED'
func RejectRemoveUser(ctx context.Context, userId string) error {
	ctx, span := tracer.Start(ctx, "RejectRemoveUser")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))

	query := `
		UPDATE users
		SET approved = false, approval_status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`

	result, err := db.ExecContext(ctx, query, userId)
	if err != nil {
		span.RecordError(err)
		return fmt.Errorf("failed to reject/remove user: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("user not found")
	}

	log.Printf("[USER MANAGEMENT] Rejected/removed user: %s", userId)
	return nil
}
