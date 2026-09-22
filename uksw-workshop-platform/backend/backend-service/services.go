package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	kafka "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl"
	"github.com/segmentio/kafka-go/sasl/scram"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"golang.org/x/crypto/bcrypt"
)

var (
	db          *sql.DB
	redisClient *redis.Client
	kafkaWriter *kafka.Writer
	ctx         = context.Background() // Fallback context
	tracer      = otel.Tracer("backend-service")
)

// Database Models
type User struct {
	ID           string `json:"id"`
	NIM          string `json:"nim"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"`
}

type Workshop struct {
	ID                string     `json:"workshopId"`
	SessionID         string     `json:"sessionId"`
	Code              string     `json:"code"`
	Name              string     `json:"name"`
	Credits           int        `json:"credits"`
	Semester          string     `json:"semester"`
	Faculty           string     `json:"faculty"`
	WorkshopType      string     `json:"workshopType"`
	Quota             int        `json:"quota"`
	Enrolled          int        `json:"enrolled"`
	MentorID          string     `json:"mentorId"`
	MentorName        string     `json:"mentor"`
	Schedule          []Schedule `json:"schedules,omitempty"`
	ScheduleStr       string     `json:"schedule"`
	Room              string     `json:"room"`
	SeatsEnabled      bool       `json:"seatsEnabled"`
	SeatLayout        string     `json:"seatLayout"`
	Month             int        `json:"month"`
	Year              int        `json:"year"`
	Status            string     `json:"status"`
	Date              string     `json:"date,omitempty"`
	RegistrationStart string     `json:"registrationStart"`
	RegistrationEnd   string     `json:"registrationEnd"`
	PreviewImage      string     `json:"previewImage,omitempty"`
}

type Schedule struct {
	DayOfWeek string `json:"day"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	Room      string `json:"room"`
}

type Enrollment struct {
	ID           string     `json:"id"`
	SessionID    string     `json:"session_id"`
	WorkshopCode string     `json:"workshopCode"`
	WorkshopName string     `json:"workshopName"`
	SessionCode  string     `json:"sessionCode"`
	Credits      int        `json:"credits"`
	EnrolledAt   string     `json:"enrolledAt"`
	Schedule     []Schedule `json:"schedules,omitempty"`
	ScheduleStr  string     `json:"schedule"`
	Mentor       string     `json:"mentor"`
	Tuition      float64    `json:"tuition"`
	SeatNumber   string     `json:"seatNumber,omitempty"`
	SeatID       string     `json:"seatId,omitempty"`
	Date         string     `json:"date,omitempty"`
	Rating       int        `json:"rating,omitempty"`
	Review       string     `json:"review,omitempty"`
	RatedAt      string     `json:"ratedAt,omitempty"`
	IsCompleted  bool       `json:"isCompleted"`
}

type Seat struct {
	ID                string `json:"id"`
	WorkshopSessionID string `json:"workshopSessionId"`
	SeatNumber        string `json:"seatNumber"`
	RowLetter         string `json:"rowLetter"`
	ColumnNumber      int    `json:"columnNumber"`
	Status            string `json:"status"`
	ReservedBy        string `json:"reservedBy,omitempty"`
	ReservedAt        string `json:"reservedAt,omitempty"`
}

type SeatReservation struct {
	SeatID     string `json:"seatId"`
	SeatNumber string `json:"seatNumber"`
	ReservedAt string `json:"reservedAt"`
	ExpiresIn  int    `json:"expiresIn"`
}

// Kafka configuration helpers. Local development can keep PLAINTEXT Kafka,
// while Aiven uses TLS + SASL/SCRAM without changing the queue business logic.
func kafkaTLSConfig() (*tls.Config, error) {
	caFile := os.Getenv("KAFKA_CA_FILE")
	if caFile == "" {
		return &tls.Config{MinVersion: tls.VersionTLS12}, nil
	}

	caPEM, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("read Kafka CA certificate: %w", err)
	}

	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("failed to append Kafka CA certificate")
	}

	return &tls.Config{
		MinVersion: tls.VersionTLS12,
		RootCAs:    pool,
	}, nil
}

func kafkaSASLMechanism() (sasl.Mechanism, error) {
	username := os.Getenv("KAFKA_SASL_USERNAME")
	password := os.Getenv("KAFKA_SASL_PASSWORD")
	mechanism := strings.ToUpper(os.Getenv("KAFKA_SASL_MECHANISM"))

	if mechanism == "" {
		mechanism = "SCRAM-SHA-512"
	}

	if username == "" || password == "" {
		return nil, fmt.Errorf(
			"KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required when KAFKA_TLS=true",
		)
	}

	switch mechanism {
	case "SCRAM-SHA-256":
		return scram.Mechanism(scram.SHA256, username, password)
	case "SCRAM-SHA-512":
		return scram.Mechanism(scram.SHA512, username, password)
	default:
		return nil, fmt.Errorf(
			"unsupported KAFKA_SASL_MECHANISM %q; use SCRAM-SHA-256 or SCRAM-SHA-512",
			mechanism,
		)
	}
}

func getKafkaDialer() *kafka.Dialer {
	dialer := &kafka.Dialer{
		Timeout:   10 * time.Second,
		DualStack: true,
	}

	if strings.EqualFold(os.Getenv("KAFKA_TLS"), "true") {
		tlsConfig, err := kafkaTLSConfig()
		if err != nil {
			log.Fatalf("Kafka TLS configuration error: %v", err)
		}
		saslMechanism, err := kafkaSASLMechanism()
		if err != nil {
			log.Fatalf("Kafka SASL configuration error: %v", err)
		}
		dialer.TLS = tlsConfig
		dialer.SASLMechanism = saslMechanism
	}

	return dialer
}

func getKafkaTransport(dialer *kafka.Dialer) *kafka.Transport {
	transport := &kafka.Transport{}
	if strings.EqualFold(os.Getenv("KAFKA_TLS"), "true") {
		tlsConfig, err := kafkaTLSConfig()
		if err != nil {
			log.Fatalf("Kafka TLS configuration error: %v", err)
		}
		saslMechanism, err := kafkaSASLMechanism()
		if err != nil {
			log.Fatalf("Kafka SASL configuration error: %v", err)
		}
		transport.TLS = tlsConfig
		transport.SASL = saslMechanism
	}
	return transport
}

// Initialize database connection
func init() {
	var err error

	// Connect to PostgreSQL
	dbURL := os.Getenv("DATABASE_URL")
	db, err = sql.Open("postgres", dbURL)
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}

	// Test database connection
	if err = db.Ping(); err != nil {
		panic("Failed to ping database: " + err.Error())
	}

	// Configure connection pool
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	// AUTO-FIX: Removed manual schema cleanup.
	// This is now handled by V7 migration to properly coordinate with Flyway.
	// _, _ = db.Exec(`DROP TRIGGER IF EXISTS trigger_auto_regenerate_seats ON workshop_sessions`)
	// _, _ = db.Exec(`DROP FUNCTION IF EXISTS auto_regenerate_seats()`)
	// _, _ = db.Exec(`DROP FUNCTION IF EXISTS generate_seats_for_session(UUID)`)
	log.Println("Database connection established.")

	// Connect to Redis
	redisAddr := os.Getenv("REDIS_ADDR")
	redisPass := os.Getenv("REDIS_PASSWORD")

	redisClient = redis.NewClient(&redis.Options{
		Addr:      redisAddr,
		Password:  redisPass,
		DB:        0,
		TLSConfig: &tls.Config{},
	})

	// Test Redis connection
	_, err = redisClient.Ping(ctx).Result()
	if err != nil {
		panic("Failed to connect to Redis: " + err.Error())
	}

	// Initialize Kafka writer
	kafkaBrokers := os.Getenv("KAFKA_BROKERS") // kode program 6 : Baris 01–41
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:9092"
	}
	log.Printf("API Gateway starting on port 8080 (Version: AUTO_PROMOTE_V4)")
	log.Printf("Kafka Configuration - Brokers: %s", kafkaBrokers)

	dialer := getKafkaDialer()

	// Auto-create topic
	topic := "queue.join"

	// Retry logic for topic creation
	for i := 0; i < 5; i++ {
		conn, err := dialer.DialContext(ctx, "tcp", kafkaBrokers)
		if err != nil {
			log.Printf("Attempt %d: Failed to dial kafka: %v", i+1, err)
			time.Sleep(2 * time.Second)
			continue
		}

		topicConfigs := []kafka.TopicConfig{
			{
				Topic:             topic,
				NumPartitions:     1,
				ReplicationFactor: 1,
			},
		}

		err = conn.CreateTopics(topicConfigs...)
		conn.Close()

		if err != nil {
			log.Printf("Attempt %d: Failed to create topic (might already exist): %v", i+1, err)
			// Don't return, as it might just exist. We can proceed.
			break
		} else {
			log.Printf("Successfully created topic: %s", topic)
			break
		}
	}

	kafkaWriter = &kafka.Writer{
		Addr:                   kafka.TCP(kafkaBrokers),
		Topic:                  topic,
		Balancer:               &kafka.LeastBytes{},
		Transport:              getKafkaTransport(dialer),
		AllowAutoTopicCreation: true,
	}
}

// startSlotCleanupWorker runs a background goroutine that periodically
// checks for expired slot sessions and promotes waiting users
func startSlotCleanupWorker() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		removed, err := CleanupExpiredSlots()
		if err != nil {
			log.Printf("Slot cleanup error: %v", err)
		} else if removed > 0 {
			log.Printf("Cleaned up %d expired slots", removed)
		}
	}
}

// Authentication Service Functions
func AuthenticateUser(ctx context.Context, username, password, role string) (*User, string, error) {
	log.Printf("[LOGIN DEBUG] AuthenticateUser dipanggil: username=%s role=%s", username, role)
	ctx, span := tracer.Start(ctx, "AuthenticateUser")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.username", username),
		attribute.String("user.role", role),
	)

	var user User

	// Query user from database
	query := `
		SELECT id, nim_nidn, name, email, password_hash, role, 
		       COALESCE(approved, false) as approved, 
		       COALESCE(approval_status, 'PENDING') as approval_status
		FROM users
		WHERE nim_nidn = $1 AND role = $2
	`

	_, dbSpan := tracer.Start(ctx, "db.QueryRow: GetUser")
	var approved bool
	var approvalStatus string
	err := db.QueryRowContext(ctx, query, username, role).Scan(
		&user.ID,
		&user.NIM,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&approved,
		&approvalStatus,
	)
	dbSpan.End()

	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[AUTH FAILED] User not found: username=%s, role=%s", username, role)
		} else {
			log.Printf("[AUTH FAILED] DB error for %s: %v", username, err)
		}
		span.RecordError(err)
		return nil, "", errors.New("INVALID_CREDENTIALS")
	}

	// Verify password using bcrypt
	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash),
		[]byte(password),
	); err != nil {
		log.Printf("[AUTH FAILED] Password mismatch for user=%s", username)
		return nil, "", errors.New("INVALID_CREDENTIALS")
	}

	// Check if user is approved
	if !approved || approvalStatus != "APPROVED" {
		log.Printf("[AUTH FAILED] Account not approved for user=%s (approved=%v, status=%s)", username, approved, approvalStatus)
		return nil, "", errors.New("ACCOUNT_PENDING_APPROVAL")
	}

	// Generate JWT token
	token, err := GenerateJWT(user.ID, user.NIM, user.Role)
	if err != nil {
		return nil, "", err
	}

	// Store session in Redis
	sessionKey := fmt.Sprintf("session:%s", user.ID)
	sessionData := map[string]interface{}{
		"userId":       user.ID,
		"nim":          user.NIM,
		"name":         user.Name,
		"role":         user.Role,
		"loginTime":    time.Now().Format(time.RFC3339),
		"lastActivity": time.Now().Format(time.RFC3339),
	}

	pipeline := redisClient.Pipeline()
	pipeline.HSet(ctx, sessionKey, sessionData)
	pipeline.Expire(ctx, sessionKey, 2*time.Hour)

	// Single session enforcement: Store the active token
	// Only this token will be valid for this user
	tokenKey := fmt.Sprintf("active_token:%s", user.ID)
	pipeline.Set(ctx, tokenKey, token, 2*time.Hour)

	_, err = pipeline.Exec(ctx)
	if err != nil {
		return nil, "", err
	}

	return &user, token, nil
}

// Queue Management Functions
// Keys used:
// - "active_slots" (SET): Users currently allowed on selection page
// - "waiting_queue" (ZSET): Users waiting, scored by join timestamp
// - "slot_session:{userId}" (STRING with TTL): Active slot session marker
// - "queue_limit" (STRING): Max concurrent users allowed

const (
	slotSessionTTL = 5 * time.Minute  // How long an active slot lasts without heartbeat
	heartbeatTTL   = 30 * time.Second // Heartbeat refresh interval
)

// JoinQueue adds user to the queue system using WAR MODE logic.
// If active slots < limit: user gets immediate access (returns position 0)
// If activeSlots >= limit: user is sent to Kafka queue for FIFO processing
func JoinQueue(ctx context.Context, userId string) (int, int, error) { // yang dimasukkan dalam jurnal disini menunjukkan proses utama saat mahasiswa masuk ke sistem antrean dari sisi backend
	ctx, span := tracer.Start(ctx, "JoinQueue")
	defer span.End()

	// Get current limit from Redis (set by mentor)
	limit := getQueueLimit()

	// Check if user already has an active slot
	isActive, _ := redisClient.SIsMember(ctx, "active_slots", userId).Result()
	if isActive {
		// Already active, just refresh their session
		refreshSlotSession(userId)
		return 0, 0, nil // Position 0 means already active/direct access
	}

	// Check current active count
	activeCount, err := redisClient.SCard(ctx, "active_slots").Result()
	if err != nil {
		span.RecordError(err)
		return 0, 0, err
	}

	// WAR MODE LOGIC: Atomically check if slots available and add
	if int(activeCount) < limit {
		added, addErr := atomicAddToActiveSlotsIfSpace(ctx, userId)
		if addErr != nil {
			span.RecordError(addErr)
			return 0, 0, addErr
		}

		if added {
			// DIRECT ACCESS - slot was atomically reserved!
			log.Printf("[WAR MODE] User %s DIRECT ACCESS (%d/%d slots)", userId, activeCount+1, limit)
			span.SetAttributes(
				attribute.String("user.id", userId),
				attribute.String("status", "direct_access"),
				attribute.Int64("active_count", activeCount+1),
				attribute.Int("limit", limit),
			)

			// Publish ACTIVATED event to Kafka for logging/analytics
			publishKafkaMessage(ctx, kafka.Message{
				Key:   []byte(userId),
				Value: []byte(fmt.Sprintf(`{"userId":"%s","event":"ACTIVATED","timestamp":"%s"}`, userId, time.Now().Format(time.RFC3339))),
			})

			return 0, 0, nil // Position 0 = direct access
		}
		// Atomic add failed (race: slots filled between SCard and Lua script) - fall through to queue
		log.Printf("[WAR MODE] User %s atomic slot grab failed, queueing instead", userId)
	}

	// NO SLOTS AVAILABLE - Send to Kafka queue for FIFO processing
	// Add to Redis ZSET for accurate position tracking (ZRank)
	redisClient.ZAdd(ctx, "waiting_queue", &redis.Z{ //kode 4 : menunjukkan proses ketika slot aktif sudah penuh dan mahasiswa harus masuk ke antrean tunggu.
		Score:  float64(time.Now().UnixNano()),
		Member: userId,
	})

	// The Kafka consumer will block until a slot becomes available
	timestamp := time.Now().Format(time.RFC3339)
	publishKafkaMessage(ctx, kafka.Message{
		Key:   []byte(userId),
		Value: []byte(fmt.Sprintf(`{"userId":"%s","event":"REQUEST_JOIN","timestamp":"%s"}`, userId, timestamp)),
	})

	log.Printf("[WAR MODE] User %s QUEUED via Kafka & ZSET (%d/%d slots full)", userId, activeCount, limit)
	span.SetAttributes(
		attribute.String("user.id", userId),
		attribute.String("status", "queued_to_kafka"),
		attribute.Int64("active_count", activeCount),
		attribute.Int("limit", limit),
	)

	// Return position 1 to indicate "you're in queue"
	return 1, 2, nil
}

// ... helper ...

// GetQueueStatus returns status with ACCURATE wait time based on active slots
func GetQueueStatus(ctx context.Context, userId string) (map[string]interface{}, error) {
	ctx, span := tracer.Start(ctx, "GetQueueStatus")
	defer span.End()

	limit := getQueueLimit()

	// 1. Check if ACTIVE
	isActive, _ := redisClient.SIsMember(ctx, "active_slots", userId).Result()
	if isActive {
		ttl, err := redisClient.TTL(ctx, fmt.Sprintf("slot_session:%s", userId)).Result()
		if err != nil || ttl < 0 {
			removeFromActiveSlots(userId)
			return map[string]interface{}{"inQueue": false, "message": "Session expired"}, nil
		}
		return map[string]interface{}{
			"inQueue":          true,
			"position":         0,
			"status":           "ACTIVE",
			"limit":            limit,
			"remainingSeconds": int(ttl.Seconds()),
		}, nil
	}

	// 2. Not Active -> WAITING
	// Get position from ZSET rank
	rank, err := redisClient.ZRank(ctx, "waiting_queue", userId).Result()
	var position int

	if err == nil {
		position = int(rank) + 1
	} else {
		// Not in waiting queue, position is 0
		position = 0
	}

	activeCount, _ := redisClient.SCard(ctx, "active_slots").Result()
	log.Printf("[DEBUG] GetQueueStatus user=%s position=%d active=%d limit=%d", userId, position, activeCount, limit)

	// --- AUTO-PROMOTION FALLBACK ---
	// If user is less than limit in line and slots are available, promote them NOW.
	if position < limit && int(activeCount) < limit {
		log.Printf("[Auto-Promote] User %s is less than limit in queue and slot is available (%d/%d). Promoting...", userId, activeCount, limit)

		// ATOMIC: try to add to active slots
		added, addErr := atomicAddToActiveSlotsIfSpace(ctx, userId)
		if addErr == nil && added {
			// Successfully promoted - now remove from waiting queue
			redisClient.ZRem(ctx, "waiting_queue", userId)
			redisClient.Decr(ctx, "queue_waiting_count")
			log.Printf("[Auto-Promote] User %s successfully promoted (atomic)", userId)

			// Notify via Kafka for tracking
			publishKafkaMessage(ctx, kafka.Message{
				Key:   []byte(userId),
				Value: []byte(fmt.Sprintf(`{"userId":"%s","event":"PROMOTED","timestamp":"%s"}`, userId, time.Now().Format(time.RFC3339))),
			})

			// NOTIFY USER VIA WEBSOCKET
			payload := map[string]interface{}{
				"message": "You have been automatically promoted!",
				"status":  "ACTIVE",
			}
			notifyUser(userId, "ACCESS_GRANTED", payload)
			notifyUser(userId, "AUTO_PROMOTE", payload)

			// Return ACTIVE status immediately
			ttl, _ := redisClient.TTL(ctx, fmt.Sprintf("slot_session:%s", userId)).Result()
			return map[string]interface{}{
				"inQueue":          true,
				"position":         0,
				"status":           "ACTIVE",
				"limit":            limit,
				"activeCount":      activeCount + 1,
				"remainingSeconds": int(ttl.Seconds()),
				"message":          "You have been automatically promoted!",
			}, nil
		} else if addErr != nil {
			log.Printf("[Auto-Promote] Error promoting user %s: %v", userId, addErr)
		} else {
			log.Printf("[Auto-Promote] Slots full for user %s (atomic check failed), staying in queue", userId)
		}
	}

	// Calculate ESTIMATED wait time based on MINIMUM remaining TTL of active users
	// This makes the countdown match the "session user who in selection course page"
	minTTL := 120.0 // Default 2 mins

	users, _ := redisClient.SMembers(ctx, "active_slots").Result()
	if len(users) > 0 {
		first := true
		for _, uid := range users {
			t, err := redisClient.TTL(ctx, fmt.Sprintf("slot_session:%s", uid)).Result()
			if err == nil && t > 0 {
				if first || t.Seconds() < minTTL {
					minTTL = t.Seconds()
					first = false
				}
			}
		}
	}

	// If slots are not full, wait time is 0 (should be processed instantly)
	if int(activeCount) < limit {
		minTTL = 0
	}

	return map[string]interface{}{
		"inQueue":              true,
		"position":             position,
		"status":               "WAITING",
		"limit":                limit,
		"activeCount":          activeCount,
		"estimatedWaitMinutes": int(minTTL / 60),
		"estimatedWaitSeconds": int(minTTL),
		"timestamp":            time.Now().Format(time.RFC3339),
		"message":              "Waiting for next slot to open...",
	}, nil
}

// GetQueueMetricsAndLimit returns metrics for the dashboard
func GetQueueMetricsAndLimit(ctx context.Context) (map[string]interface{}, error) {
	limit := getQueueLimit()
	activeCount, _ := redisClient.SCard(ctx, "active_slots").Result()

	// Get waiting count from ZSET size
	waitingCount, _ := redisClient.ZCard(ctx, "waiting_queue").Result()

	return map[string]interface{}{
		"activeUsers":  activeCount,
		"waitingUsers": waitingCount,
		"limit":        limit,
	}, nil
}

// addToActiveSlots adds a user to active slots with session tracking
func addToActiveSlots(userId string) error {
	pipeline := redisClient.Pipeline()
	pipeline.SAdd(ctx, "active_slots", userId)
	pipeline.Set(ctx, fmt.Sprintf("slot_session:%s", userId), "active", slotSessionTTL)
	_, err := pipeline.Exec(ctx)
	return err
}

// atomicAddToActiveSlotsIfSpace atomically checks if space available and adds user
// Returns true if user was added, false if slots are full
func atomicAddToActiveSlotsIfSpace(ctx context.Context, userId string) (bool, error) {
	script := `
		local activeKey = KEYS[1]
		local sessionKey = KEYS[2]
		local limitKey = KEYS[3]
		local userId = ARGV[1]
		local ttl = tonumber(ARGV[2])
		
		local limit = tonumber(redis.call('GET', limitKey) or '50')
		local activeCount = redis.call('SCARD', activeKey)
		
		if activeCount < limit then
			redis.call('SADD', activeKey, userId)
			redis.call('SET', sessionKey, 'active', 'EX', ttl)
			return 1
		else
			return 0
		end
	`

	result, err := redisClient.Eval(ctx, script, []string{
		"active_slots",
		fmt.Sprintf("slot_session:%s", userId),
		"queue_limit",
	}, userId, int(slotSessionTTL.Seconds())).Int()

	if err != nil {
		return false, err
	}

	return result == 1, nil
}

// refreshSlotSession used to refresh TTL, but for WAR MODE we want fixed slots.
// So this now just checks if session exists to confirm activity, but DOES NOT extend time.
func refreshSlotSession(userId string) error {
	// We don't extend the session. The slot time is fixed (e.g. 10-15 mins) to ensure turnover.
	// We just check if it exists.
	exists, err := redisClient.Exists(ctx, fmt.Sprintf("slot_session:%s", userId)).Result()
	if err != nil {
		return err
	}
	if exists == 0 {
		return errors.New("session expired")
	}
	return nil
}

// Heartbeat checks if session exists (activity check) and returns remaining TTL
func Heartbeat(ctx context.Context, userId string) (int, error) {
	ctx, span := tracer.Start(ctx, "Heartbeat")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))

	isActive, _ := redisClient.SIsMember(ctx, "active_slots", userId).Result()
	if !isActive {
		return 0, errors.New("NOT_ACTIVE")
	}

	// Just check if session exists (refreshSlotSession does this now)
	err := refreshSlotSession(userId)
	if err != nil {
		return 0, err
	}

	// Get remaining TTL to send back to client
	ttl, err := redisClient.TTL(ctx, fmt.Sprintf("slot_session:%s", userId)).Result()
	if err != nil {
		return 0, err
	}

	return int(ttl.Seconds()), nil
}

// LeaveQueue removes user from active slots
// This DOES NOT touch Kafka queue - the consumer is blocked and will auto-resume
// when it detects available slots (checked every 1 second in consumer loop)
func LeaveQueue(ctx context.Context, userId string) error {
	ctx, span := tracer.Start(ctx, "LeaveQueue")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))

	// Get active count before removal
	activeCountBefore, _ := redisClient.SCard(ctx, "active_slots").Result()

	// Remove from active slots, session, and waiting queue
	pipeline := redisClient.Pipeline()
	pipeline.SRem(ctx, "active_slots", userId)
	pipeline.Del(ctx, fmt.Sprintf("slot_session:%s", userId))
	pipeline.ZRem(ctx, "waiting_queue", userId)
	_, err := pipeline.Exec(ctx)

	if err != nil {
		span.RecordError(err)
		return err
	}

	// Get active count after removal
	activeCountAfter, _ := redisClient.SCard(ctx, "active_slots").Result()

	log.Printf("[WAR MODE] User %s left queue. Slots: %d → %d (freed slot for Kafka consumer)",
		userId, activeCountBefore, activeCountAfter)

	// NOTE: No need to explicitly "promote" or "resume" Kafka consumer
	// The consumer is running in a blocking loop checking for available slots
	// It will automatically detect the freed slot within 1 second and process the next user

	span.SetAttributes(
		attribute.Int64("slots_before", activeCountBefore),
		attribute.Int64("slots_after", activeCountAfter),
	)

	return err
}

// removeFromActiveSlots removes a user from active slots only
func removeFromActiveSlots(userId string) error {
	pipeline := redisClient.Pipeline()
	pipeline.SRem(ctx, "active_slots", userId)
	pipeline.Del(ctx, fmt.Sprintf("slot_session:%s", userId))
	_, err := pipeline.Exec(ctx)
	return err
}

// promoteWaitingUsers moves users from waiting queue to active slots
// based on available capacity
func promoteWaitingUsers(ctx context.Context) ([]string, error) {
	ctx, span := tracer.Start(ctx, "promoteWaitingUsers")
	defer span.End()

	// Acquire distributed lock to prevent concurrent promotions
	lockKey := "promotion_lock"
	locked, err := redisClient.SetNX(ctx, lockKey, "1", 5*time.Second).Result()
	if err != nil || !locked {
		// Another process is promoting, skip
		return nil, nil
	}
	defer redisClient.Del(ctx, lockKey)

	limit := getQueueLimit()
	activeCount, _ := redisClient.SCard(ctx, "active_slots").Result()

	availableSlots := limit - int(activeCount)
	if availableSlots <= 0 {
		return nil, nil
	}

	// Get the next N users from waiting queue (ordered by timestamp - FIFO)
	waitingUsers, err := redisClient.ZRange(ctx, "waiting_queue", 0, int64(availableSlots-1)).Result()
	if err != nil || len(waitingUsers) == 0 {
		return nil, err
	}

	var promotedUsers []string
	for _, userId := range waitingUsers {
		// ATOMIC: try to add to active slots
		added, addErr := atomicAddToActiveSlotsIfSpace(ctx, userId)
		if addErr != nil {
			log.Printf("Error promoting user %s: %v", userId, addErr)
			break // Stop promoting if Redis errors
		}
		if !added {
			log.Printf("Slots full, stopping promotion at user %s", userId)
			break // Slots are now full
		}

		// Successfully added - remove from waiting queue
		redisClient.ZRem(ctx, "waiting_queue", userId)
		promotedUsers = append(promotedUsers, userId)
		log.Printf("Promoted user %s to active slots (atomic)", userId)

		// Publish promotion event to Kafka
		publishKafkaMessage(ctx, kafka.Message{
			Key:   []byte(userId),
			Value: []byte(fmt.Sprintf(`{"userId":"%s","event":"PROMOTED","timestamp":"%s"}`, userId, time.Now().Format(time.RFC3339))),
		})

		// REAL-TIME NOTIFICATION via WebSocket
		payload := map[string]interface{}{
			"message": "You have been promoted! Redirecting to course selection...",
			"status":  "ACTIVE",
		}
		notifyUser(userId, "ACCESS_GRANTED", payload)
		notifyUser(userId, "AUTO_PROMOTE", payload)
	}

	// BROADCAST queue update so remaining users see their position decrease
	newWaitingCount, _ := redisClient.ZCard(ctx, "waiting_queue").Result()
	notifyAll("QUEUE_POSITION", map[string]interface{}{
		"position":             int(newWaitingCount),
		"estimatedWaitMinutes": calculateETA(int(newWaitingCount)),
	})

	return promotedUsers, nil
}

// CleanupExpiredSlots checks for expired slot sessions and removes them
// This should be called periodically (e.g., by a background goroutine)
func CleanupExpiredSlots() (int, error) {
	ctx, span := tracer.Start(context.Background(), "CleanupExpiredSlots")
	defer span.End()

	// Get all active slot users
	activeUsers, err := redisClient.SMembers(ctx, "active_slots").Result()
	if err != nil {
		return 0, err
	}

	removedCount := 0
	for _, userId := range activeUsers {
		// Check if their session key still exists
		exists, _ := redisClient.Exists(ctx, fmt.Sprintf("slot_session:%s", userId)).Result()
		if exists == 0 {
			// Session expired, remove from active slots
			removeFromActiveSlots(userId)
			removedCount++
			log.Printf("Cleaned up expired slot for user %s", userId)
		}
	}

	// Promote waiting users to fill vacated slots
	if removedCount > 0 {
		promoteWaitingUsers(ctx)
	}

	return removedCount, nil
}

// getQueueLimit returns the current concurrent user limit
func getQueueLimit() int {
	limitStr, err := redisClient.Get(ctx, "queue_limit").Result()
	limit := 50 // Default limit (changed from 5000 to more reasonable default)
	if err == nil {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	return limit
}

// calculateETA estimates wait time based on position
func calculateETA(waitingPosition int) int {
	// Estimate 2 minutes per position (users typically spend 2 min on selection)
	return waitingPosition * 2
}

func InvalidateSession(userId string) error {
	pipeline := redisClient.Pipeline()
	pipeline.Del(ctx, fmt.Sprintf("session:%s", userId))
	pipeline.Del(ctx, fmt.Sprintf("active_token:%s", userId))
	_, err := pipeline.Exec(ctx)
	return err
}

func SetQueueLimit(limit int) error {
	err := redisClient.Set(ctx, "queue_limit", limit, 0).Err()
	if err != nil {
		return err
	}
	// After increasing limit, promote waiting users
	promoteWaitingUsers(ctx)
	return nil
}

// Workshop Functions
func GetAvailableWorkshops(ctx context.Context, semester, faculty, page, limit string) ([]Workshop, map[string]interface{}, error) {
	ctx, span := tracer.Start(ctx, "GetAvailableCourses")
	defer span.End()

	// TODO: Implement pagination and filtering
	query := `
		SELECT c.id, cl.id, c.code, c.name, c.credits, c.faculty,
		       cl.quota, 
               (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cl.id AND e.status = 'ACTIVE') as enrolled_count, 
		       u.name as mentor_name,
		       c.workshop_type,
               COALESCE(string_agg(substring(sch.day_of_week, 1, 3) || ' ' || substring(sch.start_time::text, 1, 5) || '-' || substring(sch.end_time::text, 1, 5), ', '), '') as schedule,
               COALESCE(MAX(sch.room), 'TBD') as room,
               cl.seats_enabled,
               COALESCE(cl.month, EXTRACT(MONTH FROM CURRENT_DATE)::INT) as month,
               COALESCE(cl.year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) as year,
               COALESCE(cl.status, 'active') as ws_status,
               COALESCE(cl.date::text, '') as date,
               COALESCE(to_char(cl.registration_start, 'YYYY-MM-DD"T"HH24:MI'), '') as registration_start,
               COALESCE(to_char(cl.registration_end, 'YYYY-MM-DD"T"HH24:MI'), '') as registration_end,
               COALESCE(c.preview_image, '') as preview_image
		FROM workshops c
		JOIN workshop_sessions cl ON c.id = cl.workshop_id
		JOIN semesters s ON cl.semester_id = s.id
		JOIN mentors l ON cl.mentor_id = l.id
		JOIN users u ON l.user_id = u.id
        LEFT JOIN schedules sch ON cl.id = sch.class_id
		WHERE s.code = $1
		AND ($2 = '' OR c.faculty = $2)
        GROUP BY c.id, cl.id, u.name, c.workshop_type, cl.seats_enabled
		LIMIT 20
	`

	_, dbSpan := tracer.Start(ctx, "db.Query: GetAvailableCourses")
	rows, err := db.QueryContext(ctx, query, semester, faculty)
	dbSpan.End()
	if err != nil {
		span.RecordError(err)
		return nil, nil, err
	}
	defer rows.Close()

	var workshops []Workshop
	for rows.Next() {
		var workshop Workshop
		err := rows.Scan(
			&workshop.ID,
			&workshop.SessionID,
			&workshop.Code,
			&workshop.Name,
			&workshop.Credits,
			&workshop.Faculty,
			&workshop.Quota,
			&workshop.Enrolled,
			&workshop.MentorName,
			&workshop.WorkshopType,
			&workshop.ScheduleStr,
			&workshop.Room,
			&workshop.SeatsEnabled,
			&workshop.Month,
			&workshop.Year,
			&workshop.Status,
			&workshop.Date,
			&workshop.RegistrationStart,
			&workshop.RegistrationEnd,
			&workshop.PreviewImage,
		)
		if err != nil {
			continue
		}

		// Use date as schedule if schedule string is empty
		if workshop.ScheduleStr == "" && workshop.Date != "" {
			workshop.ScheduleStr = workshop.Date
		} else if workshop.Date != "" {
			// Append date if schedule exists
			workshop.ScheduleStr += " (" + workshop.Date + ")"
		}
		workshop.Date = "" // Clear to avoid duplicate in JSON

		workshops = append(workshops, workshop)
	}

	pagination := map[string]interface{}{
		"page":       1,
		"limit":      20,
		"totalPages": 1,
	}

	return workshops, pagination, nil
}

func GetWorkshopDetails(ctx context.Context, courseId string) (*Workshop, error) {
	ctx, span := tracer.Start(ctx, "GetCourseDetails")
	defer span.End()
	span.SetAttributes(attribute.String("course.id", courseId))

	// TODO: Implement full course details with schedules
	var workshop Workshop

	query := `
		SELECT c.id, c.code, c.name, c.credits, c.faculty
		FROM workshops c
		WHERE c.id = $1
	`

	err := db.QueryRowContext(ctx, query, courseId).Scan(
		&workshop.ID,
		&workshop.Code,
		&workshop.Name,
		&workshop.Credits,
		&workshop.Faculty,
	)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}

	return &workshop, err
}

// Enrollment Functions
func AddWorkshopEnrollment(ctx context.Context, userId, classId, seatId string) (*Enrollment, int, error) {
	ctx, span := tracer.Start(ctx, "AddWorkshopEnrollment")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.id", userId),
		attribute.String("class.id", classId),
		attribute.String("seat.id", seatId),
	)

	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()

	// Lock the class row and count actual ACTIVE enrollments to prevent race conditions
	var quota, enrolledCount int
	var regStart, regEnd sql.NullTime

	err = tx.QueryRowContext(ctx, `
		SELECT 
			ws.quota,
			(SELECT COUNT(*) FROM enrollments e 
			 WHERE e.class_id = ws.id AND e.status = 'ACTIVE') as enrolled_count,
			ws.registration_start,
			ws.registration_end
		FROM workshop_sessions ws
		WHERE ws.id = $1
		FOR UPDATE
	`, classId).Scan(&quota, &enrolledCount, &regStart, &regEnd)

	if err != nil {
		return nil, 0, err
	}

	// VALIDATION: Check Registration Period
	now := time.Now()
	if regStart.Valid && now.Before(regStart.Time) {
		return nil, 0, errors.New("REGISTRATION_NOT_OPEN")
	}
	if regEnd.Valid && now.After(regEnd.Time) {
		return nil, 0, errors.New("REGISTRATION_CLOSED")
	}

	// Check quota with dynamically counted enrollments
	if enrolledCount >= quota {
		return nil, 0, errors.New("QUOTA_EXCEEDED")
	}

	// Calculate current total credits
	var currentCredits int
	err = tx.QueryRow(`
		SELECT COALESCE(SUM(c.credits), 0)
		FROM enrollments e
		JOIN workshop_sessions cl ON e.class_id = cl.id
		JOIN workshops c ON cl.workshop_id = c.id
		WHERE e.student_id = (SELECT id FROM students WHERE user_id = $1)
		AND e.status = 'ACTIVE'
	`, userId).Scan(&currentCredits)

	if err != nil {
		return nil, 0, err
	}

	// Get workshop credits
	var courseCredits int
	err = tx.QueryRow(`
		SELECT c.credits
		FROM workshop_sessions cl
		JOIN workshops c ON cl.workshop_id = c.id
		WHERE cl.id = $1
	`, classId).Scan(&courseCredits)

	if err != nil {
		return nil, 0, err
	}

	// Check credit limit (hardcoded 24 for now)
	if currentCredits+courseCredits > 24 {
		return nil, 0, errors.New("CREDIT_LIMIT_EXCEEDED")
	}

	// Check schedule conflicts
	var conflictCount int
	err = tx.QueryRow(`
		SELECT COUNT(*)
		FROM enrollments e1
		JOIN workshop_sessions cl1 ON e1.class_id = cl1.id
		JOIN schedules s1 ON cl1.id = s1.class_id
		JOIN schedules s2 ON s2.class_id = $1
		WHERE e1.student_id = (SELECT id FROM students WHERE user_id = $2)
		AND e1.status = 'ACTIVE'
		AND s1.day_of_week = s2.day_of_week
		AND (s1.start_time, s1.end_time) OVERLAPS (s2.start_time, s2.end_time)
	`, classId, userId).Scan(&conflictCount)

	if err != nil {
		return nil, 0, err
	}

	if conflictCount > 0 {
		return nil, 0, errors.New("SCHEDULE_CONFLICT")
	}

	// Check for existing enrollment
	var existingId, existingStatus string
	err = tx.QueryRow(`
		SELECT id, status 
		FROM enrollments 
		WHERE student_id = (SELECT id FROM students WHERE user_id = $1)
		AND class_id = $2
	`, userId, classId).Scan(&existingId, &existingStatus)

	if err != nil && err != sql.ErrNoRows {
		return nil, 0, err
	}

	var enrollmentId string
	if err == nil {
		// Enrollment exists
		if existingStatus == "ACTIVE" {
			return nil, 0, errors.New("ALREADY_ENROLLED")
		}

		// Reactivate dropped enrollment
		_, err = tx.Exec(`
			UPDATE enrollments 
			SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP, enrolled_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, existingId)
		if err != nil {
			return nil, 0, err
		}
		enrollmentId = existingId
	} else {
		// Insert new enrollment
		err = tx.QueryRow(`
			INSERT INTO enrollments (student_id, class_id, status)
			VALUES ((SELECT id FROM students WHERE user_id = $1), $2, 'ACTIVE')
			RETURNING id
		`, userId, classId).Scan(&enrollmentId)
		if err != nil {
			return nil, 0, err
		}
	}

	// Handle Seat Assignment if provided
	if seatId != "" {
		// Verify seat ownership (must be reserved by this user)
		var seatStatus string
		var reservedBy string
		err = tx.QueryRow(`SELECT status, reserved_by FROM seats WHERE id = $1`, seatId).Scan(&seatStatus, &reservedBy)
		if err != nil {
			return nil, 0, fmt.Errorf("SEAT_ERROR: %v", err)
		}

		if seatStatus != "RESERVED" || reservedBy != userId {
			return nil, 0, errors.New("SEAT_NOT_RESERVED_BY_USER")
		}

		// Mark seat as OCCUPIED
		_, err = tx.Exec(`UPDATE seats SET status = 'OCCUPIED' WHERE id = $1`, seatId)
		if err != nil {
			return nil, 0, fmt.Errorf("SEAT_UPDATE_ERROR: %v", err)
		}

		// Link enrollment to seat
		_, err = tx.Exec(`
			INSERT INTO workshop_enrollment_seats (enrollment_id, seat_id)
			VALUES ($1, $2)
			ON CONFLICT (enrollment_id) DO UPDATE SET seat_id = $2
		`, enrollmentId, seatId)
		if err != nil {
			return nil, 0, fmt.Errorf("SEAT_LINK_ERROR: %v", err)
		}

		// Cleanup Redis reservation
		redisClient.Del(ctx, fmt.Sprintf("seat_reservation:%s", userId))

		// Notify seat status update
		notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
			"seatId":     seatId,
			"status":     "OCCUPIED",
			"reservedBy": nil,
		})
	}

	// Update enrolled count in session
	_, err = tx.Exec(`
		UPDATE workshop_sessions
		SET enrolled_count = enrolled_count + 1
		WHERE id = $1
	`, classId)

	if err != nil {
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		return nil, 0, err
	}

	// Get enrollment details
	enrollment := &Enrollment{
		ID: enrollmentId,
	}

	// Calculate total credits after adding
	totalCredits := currentCredits + courseCredits

	return enrollment, totalCredits, nil
}

func DropWorkshopEnrollment(ctx context.Context, userId, enrollmentId string) error {
	ctx, span := tracer.Start(ctx, "DropCourseEnrollment")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.id", userId),
		attribute.String("enrollment.id", enrollmentId),
	)

	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		span.RecordError(err)
		return err
	}
	defer tx.Rollback()

	// Get class_id and verify ownership/status
	var classId string
	var status string
	var regEnd sql.NullTime

	err = tx.QueryRowContext(ctx, `
		SELECT e.class_id, e.status, ws.registration_end
		FROM enrollments e
		JOIN workshop_sessions ws ON e.class_id = ws.id
		WHERE e.id = $1 
		AND e.student_id = (SELECT id FROM students WHERE user_id = $2)
		FOR UPDATE
	`, enrollmentId, userId).Scan(&classId, &status, &regEnd)

	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("ENROLLMENT_NOT_FOUND")
		}
		span.RecordError(err)
		return err
	}

	if status != "ACTIVE" {
		return errors.New("ENROLLMENT_NOT_ACTIVE")
	}

	// VALIDATION: Cannot drop if registration period has ended
	now := time.Now()
	if regEnd.Valid && now.After(regEnd.Time) {
		return errors.New("REGISTRATION_CLOSED")
	}

	// Update status to DROPPED
	_, err = tx.ExecContext(ctx, `
		UPDATE enrollments 
		SET status = 'DROPPED', updated_at = CURRENT_TIMESTAMP 
		WHERE id = $1
	`, enrollmentId)

	if err != nil {
		span.RecordError(err)
		return err
	}

	// Check for associated seat
	var seatId string
	err = tx.QueryRow(`SELECT seat_id FROM workshop_enrollment_seats WHERE enrollment_id = $1`, enrollmentId).Scan(&seatId)
	if err == nil {
		// Release the seat
		_, err = tx.Exec(`UPDATE seats SET status = 'AVAILABLE', reserved_by = NULL, reserved_at = NULL WHERE id = $1`, seatId)
		if err == nil {
			// Notify seat release
			notifyAll("SEAT_STATUS_UPDATE", map[string]interface{}{
				"seatId":     seatId,
				"status":     "AVAILABLE",
				"reservedBy": nil,
			})
		}
		// Link will be removed by CASCADE or we can do it explicitly
		tx.Exec(`DELETE FROM workshop_enrollment_seats WHERE enrollment_id = $1`, enrollmentId)
	}

	// Decrement workshop session enrollment count
	_, err = tx.ExecContext(ctx, `
		UPDATE workshop_sessions 
		SET enrolled_count = enrolled_count - 1 
		WHERE id = $1
	`, classId)

	if err != nil {
		span.RecordError(err)
		return err
	}

	err = tx.Commit()
	if err != nil {
		span.RecordError(err)
	}
	return err
}

// formatTimeHHMM extracts HH:MM from various time string formats
// Handles: "08:00:00", "08:00", "0800", "08:00:00+07", etc.
func formatTimeHHMM(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return "00:00"
	}
	// If it contains a colon, extract first two parts
	if strings.Contains(t, ":") {
		parts := strings.SplitN(t, ":", 3)
		if len(parts) >= 2 {
			return parts[0] + ":" + parts[1]
		}
	}
	// Try bare digits like "0800" or "800"
	digits := ""
	for _, c := range t {
		if c >= '0' && c <= '9' {
			digits += string(c)
		}
		if len(digits) >= 4 {
			break
		}
	}
	if len(digits) >= 4 {
		return digits[:2] + ":" + digits[2:4]
	}
	if len(digits) >= 2 {
		return digits[:2] + ":00"
	}
	return "00:00"
}

func GetStudentWorkshops(ctx context.Context, userId string) ([]Enrollment, error) {
	ctx, span := tracer.Start(ctx, "GetStudentCourses")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))
	log.Printf("[ENROLLMENT DEBUG] GetStudentWorkshops START: userId=%s", userId)

	query := `
		SELECT e.id, c.code, c.name, cl.class_code, c.credits, e.enrolled_at, u.name as mentor_name, cl.id as class_id,
		       COALESCE(st.seat_number, '') as seat_number, COALESCE(st.id::text, '') as seat_id
		FROM enrollments e
		JOIN students s ON e.student_id = s.id
		JOIN workshop_sessions cl ON e.class_id = cl.id
		JOIN workshops c ON cl.workshop_id = c.id
		JOIN mentors l ON cl.mentor_id = l.id
		JOIN users u ON l.user_id = u.id
		LEFT JOIN workshop_enrollment_seats wes ON e.id = wes.enrollment_id
		LEFT JOIN seats st ON wes.seat_id = st.id
		WHERE s.user_id = $1
		AND e.status = 'ACTIVE'
		ORDER BY e.enrolled_at DESC
	`

	rows, err := db.QueryContext(ctx, query, userId)
	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	defer rows.Close()

	var enrollments []Enrollment
	for rows.Next() {
		var enrollment Enrollment
		err := rows.Scan(
			&enrollment.ID,
			&enrollment.WorkshopCode,
			&enrollment.WorkshopName,
			&enrollment.SessionCode,
			&enrollment.Credits,
			&enrollment.EnrolledAt,
			&enrollment.Mentor,
			&enrollment.SessionID,
			&enrollment.SeatNumber,
			&enrollment.SeatID,
		)
		if err != nil {
			continue
		}

		// Fetch schedules for this class
		schedRows, err := db.QueryContext(ctx, `
			SELECT day_of_week, start_time::text, end_time::text, room
			FROM schedules
			WHERE class_id = $1
			ORDER BY start_time
		`, enrollment.SessionID)

		if err == nil {
			var schedules []Schedule
			var schedStr string

			for schedRows.Next() {
				var s Schedule
				var start, end string
				schedRows.Scan(&s.DayOfWeek, &start, &end, &s.Room)

				// Format times - extract HH:MM
				s.StartTime = formatTimeHHMM(start)
				s.EndTime = formatTimeHHMM(end)

				schedules = append(schedules, s)

				// Build string representation: "MON 13 02 2026 08:00-10:00"
				// We need the date from the enrollment
				if schedStr != "" {
					schedStr += ", "
				}

				// Parse date to format it as DD-MM-YYYY
				var dateStr string
				if enrollment.Date != "" {
					parsedDate, _ := time.Parse("2006-01-02", enrollment.Date)
					// Format: MON 13-02-2026
					// Mon = Jan 2, 06 = 2006
					dayName := strings.ToUpper(parsedDate.Format("Mon"))
					dayStr := fmt.Sprintf("%02d", parsedDate.Day())
					monthStr := fmt.Sprintf("%02d", parsedDate.Month())
					yearStr := fmt.Sprintf("%d", parsedDate.Year())
					dateStr = fmt.Sprintf("%s %s-%s-%s", dayName, dayStr, monthStr, yearStr)
				} else {
					// Fallback if no date (shouldn't happen with valid data)
					if len(s.DayOfWeek) >= 3 {
						dateStr = strings.ToUpper(s.DayOfWeek[:3])
					} else {
						dateStr = strings.ToUpper(s.DayOfWeek)
					}
				}

				schedStr += fmt.Sprintf("%s %s-%s", dateStr, s.StartTime, s.EndTime)
			}
			schedRows.Close()
			enrollment.Schedule = schedules
			enrollment.ScheduleStr = schedStr
		} else {
			enrollment.Schedule = []Schedule{}
		}

		// Use date as schedule if schedule string is empty
		if enrollment.ScheduleStr == "" && enrollment.Date != "" {
			// Format date only if no schedule
			parsedDate, _ := time.Parse("2006-01-02", enrollment.Date)
			dayName := strings.ToUpper(parsedDate.Format("Mon"))
			dayStr := fmt.Sprintf("%02d", parsedDate.Day())
			monthStr := fmt.Sprintf("%02d", parsedDate.Month())
			yearStr := fmt.Sprintf("%d", parsedDate.Year())
			enrollment.ScheduleStr = fmt.Sprintf("%s %s-%s-%s", dayName, dayStr, monthStr, yearStr)
		}

		// If date is already in schedule, we don't need to append it again like the old code
		// enrollment.Date = "" // Keep it for frontend reference if needed, or clear it. Old code cleared it.
		// Let's keep consistent with valid JSON response

		// Calculate Tuition (250,000 per credit)
		enrollment.Tuition = float64(enrollment.Credits) * 250000.0

		enrollments = append(enrollments, enrollment)
	}

	return enrollments, nil
}

func GetMentorWorkshops(ctx context.Context, userId string) ([]Workshop, error) {
	ctx, span := tracer.Start(ctx, "GetMentorWorkshops")
	defer span.End()
	span.SetAttributes(attribute.String("user.id", userId))

	// Update query to include date formatting in SQL directly for schedule string
	// Format: MON DD-MM-YYYY HH:MM-HH:MM
	rows, err := db.QueryContext(ctx, `
		SELECT cl.id, c.code, c.name, c.credits, 
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cl.id AND e.status = 'ACTIVE') as enrolled_count, 
        cl.quota,
        c.workshop_type,
        -- Complex concatenation for Schedule String: "MON 13-02-2026 09:00-11:00"
        COALESCE(
            string_agg(
                UPPER(TO_CHAR(cl.date, 'Dy')) || ' ' || 
                TO_CHAR(cl.date, 'DD-MM-YYYY') || ' ' || 
                substring(s.start_time::text, 1, 5) || '-' || 
                substring(s.end_time::text, 1, 5), 
            ', '), 
            -- Fallback if no schedule but date exists
            UPPER(TO_CHAR(cl.date, 'Dy')) || ' ' || TO_CHAR(cl.date, 'DD-MM-YYYY')
        ) as schedule,
        COALESCE(MAX(s.room), '') as room,
        COALESCE(cl.month, EXTRACT(MONTH FROM CURRENT_DATE)::INT) as month,
        COALESCE(cl.year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) as year,
        COALESCE(cl.status, 'active') as status,
        COALESCE(cl.date::text, '') as date,
        COALESCE(to_char(cl.registration_start, 'YYYY-MM-DD"T"HH24:MI'), '') as registration_start,
        COALESCE(to_char(cl.registration_end, 'YYYY-MM-DD"T"HH24:MI'), '') as registration_end,
        COALESCE(c.preview_image, '') as preview_image
		FROM workshop_sessions cl
		JOIN workshops c ON cl.workshop_id = c.id
		JOIN mentors l ON cl.mentor_id = l.id
		JOIN users u ON l.user_id = u.id
        LEFT JOIN schedules s ON cl.id = s.class_id
		WHERE u.id = $1
        GROUP BY cl.id, c.id, c.workshop_type, cl.date
	`, userId)
	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	defer rows.Close()

	var workshops []Workshop
	for rows.Next() {
		var ws Workshop
		err := rows.Scan(&ws.SessionID, &ws.Code, &ws.Name, &ws.Credits, &ws.Enrolled, &ws.Quota, &ws.WorkshopType,
			&ws.ScheduleStr, &ws.Room, &ws.Month, &ws.Year, &ws.Status, &ws.Date, &ws.RegistrationStart, &ws.RegistrationEnd,
			&ws.PreviewImage)
		if err != nil {
			continue
		}

		ws.ID = ws.SessionID
		workshops = append(workshops, ws)
	}
	return workshops, nil
}

// CreateClassRequest defines the payload for creating a new class
type CreateClassRequest struct {
	Name              string `json:"name"`
	Code              string `json:"code"`
	Credits           int    `json:"credits"`
	Quota             int    `json:"quota"`
	WorkshopType      string `json:"workshopType"`
	Day               string `json:"day"`
	TimeStart         string `json:"timeStart"`
	TimeEnd           string `json:"timeEnd"`
	SeatsEnabled      bool   `json:"seatsEnabled"`
	Rows              int    `json:"rows"`
	Cols              int    `json:"cols"`
	Month             int    `json:"month"`
	Year              int    `json:"year"`
	Date              string `json:"date"`
	Room              string `json:"room"`
	RegistrationStart string `json:"registrationStart"`
	RegistrationEnd   string `json:"registrationEnd"`
}

type UpdateWorkshopRequest struct {
	Name              string `json:"name"`
	Quota             int    `json:"quota"`
	WorkshopType      string `json:"workshopType"`
	Day               string `json:"day"`
	TimeStart         string `json:"timeStart"`
	TimeEnd           string `json:"timeEnd"`
	Room              string `json:"room"`
	Month             int    `json:"month"`
	Year              int    `json:"year"`
	Date              string `json:"date"`
	RegistrationStart string `json:"registrationStart"`
	RegistrationEnd   string `json:"registrationEnd"`
}

type RegisterRequest struct {
	Name     string `json:"name" binding:"required"`
	NimNidn  string `json:"nimNidn" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Major    string `json:"major"`
	Role     string `json:"role"` // Default to STUDENT if not provided
}

// CreateWorkshop creates a new workshop and its first session/schedule.
// Returns the new sessionId so callers can perform follow-up operations (e.g. image upload).
func CreateWorkshop(ctx context.Context, userId string, req CreateClassRequest) (ses... (29 KB left)