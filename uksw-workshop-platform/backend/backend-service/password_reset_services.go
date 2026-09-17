// backend/backend-service/password_reset_services.go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type PasswordResetRequest struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	UserNIM   string `json:"userNim"`
	UserEmail string `json:"userEmail"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

// RequestPasswordReset verifies nim+email, then stores a pending reset with the hashed new password
func RequestPasswordReset(ctx context.Context, nim, email, newPassword string) error {
	// 1. Look up user by NIM and Email
	var userID string
	err := db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE nim_nidn = $1 AND email = $2`,
		nim, email,
	).Scan(&userID)
	if err == sql.ErrNoRows {
		return errors.New("USER_NOT_FOUND")
	}
	if err != nil {
		return fmt.Errorf("db error: %v", err)
	}

	// 2. Cancel any existing PENDING requests for this user
	_, _ = db.ExecContext(ctx,
		`UPDATE password_resets SET status = 'REJECTED', updated_at = $1 WHERE user_id = $2 AND status = 'PENDING'`,
		time.Now(), userID,
	)

	// 3. Insert new pending request (store as plain text to match the auth system)
	_, err = db.ExecContext(ctx,
		`INSERT INTO password_resets (user_id, new_password_hash, status) VALUES ($1, $2, 'PENDING')`,
		userID, newPassword,
	)
	if err != nil {
		return fmt.Errorf("failed to create reset request: %v", err)
	}

	return nil
}

// GetPasswordResetRequests returns all requests (filtered by status)
func GetPasswordResetRequests(ctx context.Context, status string) ([]PasswordResetRequest, error) {
	query := `
		SELECT pr.id, pr.user_id, u.name, u.nim_nidn, u.email, pr.status, pr.created_at
		FROM password_resets pr
		JOIN users u ON u.id = pr.user_id
	`
	args := []interface{}{}
	if status != "" && status != "all" {
		query += " WHERE pr.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY pr.created_at DESC"

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PasswordResetRequest
	for rows.Next() {
		var r PasswordResetRequest
		var createdAt time.Time
		if err := rows.Scan(&r.ID, &r.UserID, &r.UserName, &r.UserNIM, &r.UserEmail, &r.Status, &createdAt); err != nil {
			continue
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		results = append(results, r)
	}
	return results, nil
}

// ApprovePasswordReset applies the new password hash to the user and marks the request approved
func ApprovePasswordReset(ctx context.Context, requestID string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var userID, newHash string
	err = tx.QueryRowContext(ctx,
		`SELECT user_id, new_password_hash FROM password_resets WHERE id = $1 AND status = 'PENDING'`,
		requestID,
	).Scan(&userID, &newHash)
	if err == sql.ErrNoRows {
		return errors.New("REQUEST_NOT_FOUND")
	}
	if err != nil {
		return err
	}

	// Update the user's password
	_, err = tx.ExecContext(ctx,
		`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
		newHash, time.Now(), userID,
	)
	if err != nil {
		return err
	}

	// Mark request as approved
	_, err = tx.ExecContext(ctx,
		`UPDATE password_resets SET status = 'APPROVED', updated_at = $1 WHERE id = $2`,
		time.Now(), requestID,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// RejectPasswordReset marks the reset request as rejected
func RejectPasswordReset(ctx context.Context, requestID string) error {
	res, err := db.ExecContext(ctx,
		`UPDATE password_resets SET status = 'REJECTED', updated_at = $1 WHERE id = $2 AND status = 'PENDING'`,
		time.Now(), requestID,
	)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("REQUEST_NOT_FOUND")
	}
	return nil
}
