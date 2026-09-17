package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"go.opentelemetry.io/otel/attribute"
)

// Seat Management Functions

const seatReservationTTL = 5 * time.Minute // How long a seat reservation lasts

// GetWorkshopSeats returns all seats for a workshop session
func GetWorkshopSeats(ctx context.Context, sessionID string) ([]Seat, error) {
	ctx, span := tracer.Start(ctx, "GetWorkshopSeats")
	defer span.End()
	span.SetAttributes(attribute.String("session.id", sessionID))

	// Validate sessionID is not empty
	if sessionID == "" {
		err := errors.New("SESSION_ID_REQUIRED")
		span.RecordError(err)
		return nil, err
	}

	query := `
		SELECT id, workshop_session_id, seat_number, row_letter, column_number, status,
		       COALESCE(reserved_by::text, '') as reserved_by,
		       COALESCE(reserved_at::text, '') as reserved_at
		FROM seats
		WHERE workshop_session_id = $1
		ORDER BY row_letter, column_number
	`

	rows, err := db.QueryContext(ctx, query, sessionID)
	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	defer rows.Close()

	var seats []Seat
	for rows.Next() {
		var seat Seat
		err := rows.Scan(
			&seat.ID,
			&seat.WorkshopSessionID,
			&seat.SeatNumber,
			&seat.RowLetter,
			&seat.ColumnNumber,
			&seat.Status,
			&seat.ReservedBy,
			&seat.ReservedAt,
		)
		if err != nil {
			continue
		}
		seats = append(seats, seat)
	}

	return seats, nil
}

// ReserveSeat reserves a seat for a user with Redis lock
func ReserveSeat(ctx context.Context, userID, seatID string) (*SeatReservation, error) { // kode 10 : menunjukkan proses penguncian kursi menggunakan Redis dan transaksi PostgreSQL pada saat mahasiswa memilih kursi.
	ctx, span := tracer.Start(ctx, "ReserveSeat")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.id", userID),
		attribute.String("seat.id", seatID),
	)

	// Acquire distributed lock for seat
	lockKey := fmt.Sprintf("seat_lock:%s", seatID)
	locked, err := redisClient.SetNX(ctx, lockKey, userID, 10*time.Second).Result()
	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	if !locked {
		return nil, errors.New("SEAT_LOCKED_BY_ANOTHER_USER")
	}
	defer redisClient.Del(ctx, lockKey)

	// Track seat that was released during reservation (if any) to notify AFTER commit
	var releasedSeatID string

	// Start transaction for atomicity
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Check if seat is available AND lock the row
	var currentStatus string
	var seatNumber string
	var workshopSessionID string
	err = tx.QueryRowContext(ctx, `
		SELECT status, seat_number, workshop_session_id
		FROM seats
		WHERE id = $1
		FOR UPDATE
	`, seatID).Scan(&currentStatus, &seatNumber, &workshopSessionID)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("SEAT_NOT_FOUND")
		}
		span.RecordError(err)
		return nil, err
	}

	// ENFORCE ONE SEAT PER USER PER SESSION

	// 1. Check if user is ALREADY ENROLLED (has OCCUPIED seat)
	var enrollmentID string
	err = tx.QueryRowContext(ctx, `
		SELECT id FROM enrollments 
		WHERE student_id = (SELECT id FROM students WHERE user_id = $1)
		AND class_id = $2
		AND status = 'ACTIVE'
	`, userID, workshopSessionID).Scan(&enrollmentID)

	if err == nil {
		return nil, errors.New("ALREADY_ENROLLED_IN_SESSION")
	} else if err != sql.ErrNoRows {
		span.RecordError(err)
		return nil, err
	}

	// 2. Check if user has a RESERVED (temporary) seat in this session
	var existingSeatID string
	err = tx.QueryRowContext(ctx, `
		SELECT id FROM seats 
		WHERE workshop_session_id = $1 
		AND reserved_by = $2 
		AND status = 'RESERVED'
	`, workshopSessionID, userID).Scan(&existingSeatID)

	// If found and it's NOT the same seat (re-reserving same seat is fine)
	if err == nil && existingSeatID != "" && existingSeatID != seatID {
		// Found existing reservation, release it automatically
		_, err := tx.ExecContext(ctx, `
			UPDATE seats 
			SET status = 'AVAILABLE', reserved_by = NULL, reserved_at = NULL 
			WHERE id = $1
		`, existingSeatID)

		if err == nil {
			// DEFER notification until AFTER commit
			releasedSeatID = existingSeatID
			log.Printf("Marked existing seat %s for release notification after commit", existingSeatID)
		}
	}

	if currentStatus != "AVAILABLE" && existingSeatID != seatID {
		// If it's not available AND it's not our own seat we are re-reserving
		return nil, errors.New("SEAT_NOT_AVAILABLE")
	}

	// Update seat status to RESERVED
	_, err = tx.ExecContext(ctx, `
		UPDATE seats
		SET status = 'RESERVED', reserved_by = $1, reserved_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, userID, seatID)

	if err != nil {
		span.RecordError(err)
		return nil, err
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	// NOW that transaction is committed, send all WebSocket notifications

	// Notify about released seat (if any)
	if releasedSeatID != "" {
		notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
			"seatId":     releasedSeatID,
			"status":     "AVAILABLE",
			"reservedBy": nil,
		})
		log.Printf("Automatically released existing seat %s for user %s", releasedSeatID, userID)
	}

	// Store reservation in Redis with TTL
	reservationKey := fmt.Sprintf("seat_reservation:%s", userID)
	reservationData := map[string]interface{}{
		"seatId":     seatID,
		"seatNumber": seatNumber,
		"reservedAt": time.Now().Format(time.RFC3339),
	}
	redisClient.HSet(ctx, reservationKey, reservationData)
	redisClient.Expire(ctx, reservationKey, seatReservationTTL)

	// Publish new seat reservation status via WebSocket
	notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
		"seatId":     seatID,
		"status":     "RESERVED",
		"reservedBy": userID,
	})

	reservation := &SeatReservation{
		SeatID:     seatID,
		SeatNumber: seatNumber,
		ReservedAt: time.Now().Format(time.RFC3339),
		ExpiresIn:  int(seatReservationTTL.Seconds()),
	}

	span.SetAttributes(
		attribute.String("seat.number", seatNumber),
		attribute.String("reservation.status", "success"),
	)

	return reservation, nil
}

// ReleaseSeatReservation releases a reserved seat
func ReleaseSeatReservation(ctx context.Context, userID, seatID string) error {
	ctx, span := tracer.Start(ctx, "ReleaseSeatReservation")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.id", userID),
		attribute.String("seat.id", seatID),
	)

	// Check if user owns the reservation
	var reservedBy string
	err := db.QueryRowContext(ctx, `
		SELECT COALESCE(reserved_by::text, '')
		FROM seats
		WHERE id = $1
	`, seatID).Scan(&reservedBy)

	if err != nil {
		span.RecordError(err)
		return err
	}

	if reservedBy != userID {
		return errors.New("NOT_YOUR_RESERVATION")
	}

	// Release the seat
	_, err = db.ExecContext(ctx, `
		UPDATE seats
		SET status = 'AVAILABLE', reserved_by = NULL, reserved_at = NULL
		WHERE id = $1
	`, seatID)

	if err != nil {
		span.RecordError(err)
		return err
	}

	// Remove from Redis
	reservationKey := fmt.Sprintf("seat_reservation:%s", userID)
	redisClient.Del(ctx, reservationKey)

	// Notify all via WebSocket
	notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
		"seatId":     seatID,
		"status":     "AVAILABLE",
		"reservedBy": nil,
	})

	return nil
}

// ConfirmSeatAssignment confirms a seat during enrollment
func ConfirmSeatAssignment(ctx context.Context, enrollmentID, seatID, userID string) error {
	ctx, span := tracer.Start(ctx, "ConfirmSeatAssignment")
	defer span.End()
	span.SetAttributes(
		attribute.String("enrollment.id", enrollmentID),
		attribute.String("seat.id", seatID),
	)

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Update seat status to OCCUPIED
	_, err = tx.ExecContext(ctx, `
		UPDATE seats
		SET status = 'OCCUPIED'
		WHERE id = $1 AND reserved_by = $2
	`, seatID, userID)

	if err != nil {
		span.RecordError(err)
		return err
	}

	// Create enrollment-seat assignment
	_, err = tx.ExecContext(ctx, `
		INSERT INTO workshop_enrollment_seats (enrollment_id, seat_id)
		VALUES ($1, $2)
		ON CONFLICT (enrollment_id) DO UPDATE SET seat_id = $2
	`, enrollmentID, seatID)

	if err != nil {
		span.RecordError(err)
		return err
	}

	err = tx.Commit()
	if err != nil {
		span.RecordError(err)
		return err
	}

	// Remove reservation from Redis
	reservationKey := fmt.Sprintf("seat_reservation:%s", userID)
	redisClient.Del(ctx, reservationKey)

	// Notify all via WebSocket
	notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
		"seatId":     seatID,
		"status":     "OCCUPIED",
		"reservedBy": nil,
	})

	return nil
}

// GetUserSeatReservation gets the current seat reservation for a user
func GetUserSeatReservation(ctx context.Context, userID string) (*SeatReservation, error) {
	reservationKey := fmt.Sprintf("seat_reservation:%s", userID)
	data, err := redisClient.HGetAll(ctx, reservationKey).Result()

	if err != nil || len(data) == 0 {
		return nil, nil
	}

	ttl, _ := redisClient.TTL(ctx, reservationKey).Result()

	reservation := &SeatReservation{
		SeatID:     data["seatId"],
		SeatNumber: data["seatNumber"],
		ReservedAt: data["reservedAt"],
		ExpiresIn:  int(ttl.Seconds()),
	}

	return reservation, nil
}

// CleanupExpiredSeatReservations removes expired seat reservations
func CleanupExpiredSeatReservations(ctx context.Context) error {
	// Find all RESERVED seats where reservation has expired (older than 5 minutes)
	_, err := db.ExecContext(ctx, `
		UPDATE seats
		SET status = 'AVAILABLE', reserved_by = NULL, reserved_at = NULL
		WHERE status = 'RESERVED'
		AND reserved_at < NOW() - INTERVAL '5 minutes'
	`)

	return err
}
