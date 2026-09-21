package main

import (
	"bytes"
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
	// Railway can provide the Aiven CA as a multiline environment variable.
	// Keep KAFKA_CA_FILE as a fallback for local/container deployments.
	caPEM := []byte(os.Getenv("KAFKA_CA_CERT"))

	if len(bytes.TrimSpace(caPEM)) == 0 {
		caFile := os.Getenv("KAFKA_CA_FILE")
		if caFile == "" {
			return &tls.Config{MinVersion: tls.VersionTLS12}, nil
		}

		var err error
		caPEM, err = os.ReadFile(caFile)
		if err != nil {
			return nil, fmt.Errorf("read Kafka CA certificate: %w", err)
		}
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

	var algo scram.Algorithm

	switch mechanism {
	case "SCRAM-SHA-256":
		algo = scram.SHA256
	case "SCRAM-SHA-512":
		algo = scram.SHA512
	default:
		return nil, fmt.Errorf(
			"unsupported KAFKA_SASL_MECHANISM %q; use SCRAM-SHA-256 or SCRAM-SHA-512",
			mechanism,
		)
	}

	return scram.Mechanism(algo, username, password)
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
func bcryptHashPrefix(hash string) string {
	if len(hash) > 7 {
		return hash[:7]
	}
	return hash
}

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

	log.Printf("[LOGIN DEBUG] Query result: username=%s role=%s passwordHashEmpty=%v approved=%v approvalStatus=%s", username, role, user.PasswordHash == "", approved, approvalStatus)

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
		log.Printf("[LOGIN DEBUG] bcrypt verification failed: username=%s hashPrefix=%s passwordLength=%d error=%v",
			username, bcryptHashPrefix(user.PasswordHash), len(password), err)
		log.Printf("[AUTH FAILED] Password mismatch for user=%s", username)
		return nil, "", errors.New("INVALID_CREDENTIALS")
	}

	// Check if user is approved
	log.Printf("[LOGIN DEBUG] bcrypt verification SUCCESS: username=%s", username)

	if !approved || approvalStatus != "APPROVED" {
		log.Printf("[AUTH FAILED] Account not approved for user=%s (approved=%v, status=%s)", username, approved, approvalStatus)
		return nil, "", errors.New("ACCOUNT_PENDING_APPROVAL")
	}

	// Generate JWT token
	token, err := GenerateJWT(user.ID, user.NIM, user.Role)
	if err != nil {
		log.Printf("[LOGIN DEBUG] GenerateJWT FAILED: username=%s error=%v", username, err)
		return nil, "", err
	}

	log.Printf("[LOGIN DEBUG] GenerateJWT SUCCESS: username=%s", username)

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
		log.Printf("[LOGIN DEBUG] Redis session pipeline FAILED: username=%s error=%v", username, err)
		return nil, "", err
	}

	log.Printf("[LOGIN DEBUG] Redis session pipeline SUCCESS: username=%s", username)

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
func CreateWorkshop(ctx context.Context, userId string, req CreateClassRequest) (string, error) {
	ctx, span := tracer.Start(ctx, "CreateWorkshop")
	defer span.End()

	// Backdate validation: reject if month/year is in the past
	now := time.Now()
	if req.Month == 0 {
		req.Month = int(now.Month())
	}
	if req.Year == 0 {
		req.Year = now.Year()
	}
	if req.Year < now.Year() || (req.Year == now.Year() && req.Month < int(now.Month())) {
		return "", errors.New("CANNOT_CREATE_BACKDATED_WORKSHOP")
	}

	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	// 1. Get mentor_id and department
	var mentorId, department string
	err = tx.QueryRow(`
		SELECT l.id, l.department FROM mentors l 
		JOIN users u ON l.user_id = u.id 
		WHERE u.id = $1`, userId).Scan(&mentorId, &department)
	if err != nil {
		return "", errors.New("MENTOR_NOT_FOUND")
	}

	// 2. Find or Create Workshop
	var workshopId string

	// Auto-generate code if empty
	if req.Code == "" {
		prefixMap := map[string]string{
			"Technical":  "WS_TECH",
			"Creative":   "WS_CREATE",
			"Business":   "WS_BIZ",
			"Leadership": "WS_LEAD",
			"General":    "WS_GEN",
		}
		prefix, ok := prefixMap[req.WorkshopType]
		if !ok {
			prefix = "WS_GEN"
		}

		// Find highest existing code with this prefix
		var lastCode string
		err = tx.QueryRow(`
			SELECT code FROM workshops 
			WHERE code LIKE $1 || '_%' 
			ORDER BY code DESC LIMIT 1
		`, prefix).Scan(&lastCode)

		nextNum := 1
		if err == nil {
			// Extract number
			parts := strings.Split(lastCode, "_")
			if len(parts) > 0 {
				lastNumStr := parts[len(parts)-1]
				var lastNum int
				fmt.Sscanf(lastNumStr, "%d", &lastNum)
				nextNum = lastNum + 1
			}
		} else if err != sql.ErrNoRows {
			return "", fmt.Errorf("failed to generate code: %v", err)
		}

		req.Code = fmt.Sprintf("%s_%02d", prefix, nextNum)
	}

	err = tx.QueryRow(`SELECT id FROM workshops WHERE code = $1`, req.Code).Scan(&workshopId)
	if err == sql.ErrNoRows {
		// Ensure workshop type is valid
		validTypes := map[string]bool{"Technical": true, "Creative": true, "Business": true, "Leadership": true, "General": true}
		if !validTypes[req.WorkshopType] {
			req.WorkshopType = "General"
		}

		// Create new workshop - assume FTI faculty
		err = tx.QueryRow(`
			INSERT INTO workshops (code, name, credits, faculty, workshop_type)
			VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			req.Code, req.Name, req.Credits, department, req.WorkshopType).Scan(&workshopId)
		if err != nil {
			return "", fmt.Errorf("failed to create workshop: %v", err)
		}
	}

	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	// 3. Get Active Semester
	var semesterId string
	err = tx.QueryRow(`SELECT id FROM semesters WHERE is_registration_open = TRUE LIMIT 1`).Scan(&semesterId)
	if err != nil {
		return "", errors.New("NO_ACTIVE_SEMESTER_FOUND")
	}

	// 4. Create Workshop Session with month/year
	var sessionId string

	// Handle registration periods (if empty, default to open?)
	// Ideally should be mandatory, but we can default to now/future

	querySession := `
		INSERT INTO workshop_sessions (
			workshop_id, semester_id, mentor_id, class_code, quota, 
			seats_enabled, seat_layout, month, year, date, registration_start, registration_end, status
		) VALUES ($1, $2, $3, $4, $5, $6, 'STANDARD', $7, $8, $9, $10, $11, 'active')
		RETURNING id
	`

	// Derive month/year from date if not provided or just use date
	parsedDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		parsedDate = time.Now()
	}
	month := int(parsedDate.Month())
	year := parsedDate.Year()

	// Default Registration Period if not provided: Start NOW, End at Workshop Date
	regStart := req.RegistrationStart
	if regStart == "" {
		regStart = time.Now().Format("2006-01-02T15:04")
	}
	regEnd := req.RegistrationEnd
	if regEnd == "" {
		// Default to workshop start time if available, else end of day
		if req.TimeStart != "" {
			regEnd = req.Date + "T" + req.TimeStart
		} else {
			regEnd = req.Date + "T23:59"
		}
	}

	// VALIDATION: Registration Start < Registration End < Workshop Start
	const layout = "2006-01-02T15:04"

	// Normalize inputs (handle optional seconds or T separator variations if needed, though frontend sends strict format)
	// We assume standard HTML5 datetime-local format: YYYY-MM-DDTHH:mm

	tStart, err1 := time.Parse(layout, regStart[:16]) // Take first 16 chars to ignore seconds/zone if present
	if err1 != nil {
		// Fallback for RFC3339
		tStart, err1 = time.Parse(time.RFC3339, regStart)
	}

	tEnd, err2 := time.Parse(layout, regEnd[:16])
	if err2 != nil {
		tEnd, err2 = time.Parse(time.RFC3339, regEnd)
	}

	workshopStartStr := req.Date + "T" + req.TimeStart
	tWorkshop, err3 := time.Parse(layout, workshopStartStr)

	if err1 == nil && err2 == nil {
		if !tEnd.After(tStart) {
			return "", errors.New("REGISTRATION_END_MUST_BE_AFTER_START")
		}
		if err3 == nil {
			if !tWorkshop.After(tEnd) {
				return "", errors.New("WORKSHOP_START_MUST_BE_AFTER_REGISTRATION_END")
			}
		}
	}

	classCode := "A"

	err = tx.QueryRowContext(ctx, querySession,
		workshopId, semesterId, mentorId, classCode, req.Quota,
		req.SeatsEnabled, month, year, req.Date, regStart, regEnd,
	).Scan(&sessionId)
	if err != nil {
		return "", fmt.Errorf("failed to create session: %v", err)
	}

	// 4. Create Schedule
	// Derive day of week from date
	dayOfWeek := strings.ToUpper(parsedDate.Weekday().String())

	room := req.Room
	if room == "" {
		room = "TBD"
	}

	_, err = tx.Exec(`
		INSERT INTO schedules (class_id, day_of_week, start_time, end_time, room)
		VALUES ($1, $2, $3, $4, $5)`,
		sessionId, dayOfWeek, req.TimeStart+":00", req.TimeEnd+":00", room) // Append seconds for Time type
	if err != nil {
		return "", fmt.Errorf("failed to create schedule: %v", err)
	}

	// 5. Generate Seats if enabled
	if req.SeatsEnabled {
		if req.Rows <= 0 {
			req.Rows = 10
		}
		if req.Cols <= 0 {
			req.Cols = 10
		}
		_, err = tx.ExecContext(ctx, `SELECT generate_seats_for_session($1, $2, $3)`, sessionId, req.Rows, req.Cols)
		if err != nil {
			return "", fmt.Errorf("failed to generate seats: %v", err)
		}

		// Also update seats_enabled flag if needed (it is true by default but good to be explicit)
		_, err = tx.ExecContext(ctx, `UPDATE workshop_sessions SET seats_enabled = true WHERE id = $1`, sessionId)
		if err != nil {
			return "", fmt.Errorf("failed to update seats_enabled flag: %v", err)
		}
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE workshop_sessions SET seats_enabled = false WHERE id = $1`, sessionId)
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}
	return sessionId, nil
}

// UpdateWorkshopSession updates an existing workshop session
func UpdateWorkshopSession(ctx context.Context, sessionId, userId string, req UpdateWorkshopRequest) error {
	ctx, span := tracer.Start(ctx, "UpdateWorkshopSession")
	defer span.End()
	span.SetAttributes(attribute.String("session.id", sessionId))

	// Backdate validation
	now := time.Now()
	if req.Month > 0 && req.Year > 0 {
		if req.Year < now.Year() || (req.Year == now.Year() && req.Month < int(now.Month())) {
			return errors.New("CANNOT_SET_BACKDATED_WORKSHOP")
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Verify ownership - mentor must own this workshop session
	var mentorId string
	err = tx.QueryRow(`
		SELECT ws.mentor_id 
		FROM workshop_sessions ws
		JOIN mentors l ON ws.mentor_id = l.id
		WHERE ws.id = $1 AND l.user_id = $2
	`, sessionId, userId).Scan(&mentorId)
	if err == sql.ErrNoRows {
		return errors.New("WORKSHOP_NOT_FOUND_OR_NO_PERMISSION")
	}
	if err != nil {
		return fmt.Errorf("ownership check failed: %v", err)
	}

	// 1b. Block editing workshops with status 'done'
	var currentStatus string
	err = tx.QueryRow(`SELECT COALESCE(status, 'active') FROM workshop_sessions WHERE id = $1`, sessionId).Scan(&currentStatus)
	if err == nil && currentStatus == "done" {
		return errors.New("CANNOT_EDIT_COMPLETED_WORKSHOP")
	}

	// 2. Check quota constraints - cannot decrease below enrolled count
	var enrolled int
	err = tx.QueryRow(`SELECT enrolled_count FROM workshop_sessions WHERE id = $1`, sessionId).Scan(&enrolled)
	if err != nil {
		return fmt.Errorf("failed to get enrolled count: %v", err)
	}
	if req.Quota < enrolled {
		return errors.New("QUOTA_BELOW_ENROLLED_COUNT")
	}

	// 3. Update workshop details (name, workshop_type)
	var workshopId string
	err = tx.QueryRow(`SELECT workshop_id FROM workshop_sessions WHERE id = $1`, sessionId).Scan(&workshopId)
	if err == nil {
		if req.WorkshopType != "" {
			// Ensure valid type
			validTypes := map[string]bool{"Technical": true, "Creative": true, "Business": true, "Leadership": true, "General": true}
			if !validTypes[req.WorkshopType] {
				req.WorkshopType = "General"
			}
			_, _ = tx.Exec(`UPDATE workshops SET name = $1, workshop_type = $2 WHERE id = $3`, req.Name, req.WorkshopType, workshopId)
		} else {
			_, _ = tx.Exec(`UPDATE workshops SET name = $1 WHERE id = $2`, req.Name, workshopId)
		}
	}

	// VALIDATION for Partial Updates: Fetch existing values to partial validation
	if req.Date != "" || req.RegistrationStart != "" || req.RegistrationEnd != "" {
		var curDate, curRegStart, curRegEnd, curTimeStart string
		// Fetch current schedule start time as well to reconstruct workshop start
		// Current schema stores schedules separately. This is complex.
		// Simplified: Fetch session date/reg times. For timeStart, we might need to join schedules.

		err = tx.QueryRow(`
			SELECT 
				COALESCE(ws.date::text, ''), 
				COALESCE(ws.registration_start::text, ''), 
				COALESCE(ws.registration_end::text, ''),
				COALESCE((SELECT start_time::text FROM schedules WHERE class_id = ws.id LIMIT 1), '00:00:00')
			FROM workshop_sessions ws
			WHERE ws.id = $1
		`, sessionId).Scan(&curDate, &curRegStart, &curRegEnd, &curTimeStart)

		if err == nil {
			// Overlay new values
			targetDate := curDate
			if req.Date != "" {
				targetDate = req.Date
			}

			targetRegStart := curRegStart
			if req.RegistrationStart != "" {
				targetRegStart = req.RegistrationStart
			}

			targetRegEnd := curRegEnd
			if req.RegistrationEnd != "" {
				targetRegEnd = req.RegistrationEnd
			}

			targetTimeStart := curTimeStart
			if req.TimeStart != "" {
				targetTimeStart = req.TimeStart
			}

			// Normalize TimeStart (might contain seconds from DB)
			if len(targetTimeStart) > 5 {
				targetTimeStart = targetTimeStart[:5]
			}

			const layout = "2006-01-02T15:04"

			// If we have full set of data (which we should from DB + Req), validate
			// Handle DB format potentially being different (e.g. including timezone or space)
			// Simplistic parsing attempts:

			parse := func(s string) (time.Time, error) {
				s = strings.Replace(s, " ", "T", 1) // Handle SQL text output "YYYY-MM-DD HH:MM:SS"
				if len(s) > 16 {
					s = s[:16]
				}
				return time.Parse(layout, s)
			}

			tStart, err1 := parse(targetRegStart)
			tEnd, err2 := parse(targetRegEnd)
			tWorkshop, err3 := parse(targetDate + "T" + targetTimeStart)

			if err1 == nil && err2 == nil {
				if !tEnd.After(tStart) {
					return errors.New("REGISTRATION_END_MUST_BE_AFTER_START")
				}
				if err3 == nil {
					if !tWorkshop.After(tEnd) {
						return errors.New("WORKSHOP_START_MUST_BE_AFTER_REGISTRATION_END")
					}
				}
			}
		}
	}

	// Update session details
	if req.Quota > 0 || req.Date != "" || req.RegistrationStart != "" || req.RegistrationEnd != "" {
		// Build dynamic query
		query := "UPDATE workshop_sessions SET "
		params := []interface{}{}
		paramIdx := 1
		first := true

		if req.Quota > 0 {
			if !first {
				query += ", "
			}
			query += fmt.Sprintf("quota = $%d", paramIdx)
			params = append(params, req.Quota)
			paramIdx++
			first = false
		}

		if req.Date != "" {
			if !first {
				query += ", "
			}
			query += fmt.Sprintf("date = $%d", paramIdx)
			params = append(params, req.Date)
			paramIdx++
			first = false

			// Update month/year as well
			parsedDate, _ := time.Parse("2006-01-02", req.Date)
			query += fmt.Sprintf(", month = $%d, year = $%d", paramIdx, paramIdx+1)
			params = append(params, int(parsedDate.Month()), parsedDate.Year())
			paramIdx += 2
		}

		if req.RegistrationStart != "" {
			if !first {
				query += ", "
			}
			query += fmt.Sprintf("registration_start = $%d", paramIdx)
			params = append(params, req.RegistrationStart)
			paramIdx++
			first = false
		}

		if req.RegistrationEnd != "" {
			if !first {
				query += ", "
			}
			query += fmt.Sprintf("registration_end = $%d", paramIdx)
			params = append(params, req.RegistrationEnd)
			paramIdx++
			first = false
		}

		query += fmt.Sprintf(" WHERE id = $%d AND mentor_id = $%d", paramIdx, paramIdx+1)
		params = append(params, sessionId, mentorId)

		_, err = tx.ExecContext(ctx, query, params...)
		if err != nil {
			return err
		}
	}

	// 5. Update schedule
	// Derive day of week from date if date is present
	var dayOfWeek string
	if req.Date != "" {
		parsedDate, err := time.Parse("2006-01-02", req.Date)
		if err == nil {
			dayOfWeek = strings.ToUpper(parsedDate.Weekday().String())
		}
	}

	// If dayOfWeek is still empty (e.g. date parsing failed or not provided - though validation ensures date),
	// fallback or error? Validation earlier ensures Date is present or fetched.
	if dayOfWeek == "" {
		// Fetch current date if req.Date is empty
		var curDate string
		tx.QueryRow(`SELECT date FROM workshop_sessions WHERE id = $1`, sessionId).Scan(&curDate)
		if curDate != "" {
			parsedDate, _ := time.Parse("2006-01-02", curDate)
			dayOfWeek = strings.ToUpper(parsedDate.Weekday().String())
		}
	}

	_, err = tx.Exec(`
		UPDATE schedules 
		SET day_of_week = $1, start_time = $2, end_time = $3, room = $4
		WHERE class_id = $5
	`, dayOfWeek, req.TimeStart+":00", req.TimeEnd+":00", req.Room, sessionId)
	if err != nil {
		return fmt.Errorf("failed to update schedule: %v", err)
	}

	// 6. SYNC SEATS if quota changed
	if req.Quota > 0 {
		// We are already in a transaction 'tx'
		// Need to cast tx to DBExecutor?
		// Go interfaces work implicitly, *sql.Tx implements ExecContext/QueryContext/QueryRowContext
		// BUT we need to make sure CreateWorkshop/UpdateWorkshopQuota etc use the interface ref.

		// For now, simple call:
		if err := SyncSeatsWithQuota(ctx, tx, sessionId, req.Quota); err != nil {
			return fmt.Errorf("failed to sync seats: %v", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return err
	}

	// Notify if quota changed
	if req.Quota > 0 {
		notifyAll("SEATS_REGENERATED", map[string]interface{}{
			"sessionId": sessionId,
			"newQuota":  req.Quota,
			"message":   "Seats have been updated via workshop edit. Refreshing...",
		})
	}

	return nil
}

func GetWorkshopEnrolledStudents(ctx context.Context, classId string) ([]map[string]interface{}, error) {
	ctx, span := tracer.Start(ctx, "GetWorkshopEnrolledStudents")
	defer span.End()
	span.SetAttributes(attribute.String("workshop_session.id", classId))

	rows, err := db.QueryContext(ctx, `
		SELECT 
			s.id, 
			u.name, 
			u.nim_nidn, 
			e.status,
			CASE 
				WHEN seat.row_letter IS NOT NULL AND seat.seat_number IS NOT NULL 
				THEN seat.row_letter || seat.seat_number 
				ELSE NULL 
			END as seat_number
		FROM enrollments e
		JOIN students s ON e.student_id = s.id
		JOIN users u ON s.user_id = u.id
		LEFT JOIN workshop_enrollment_seats wes ON e.id = wes.enrollment_id
		LEFT JOIN seats seat ON wes.seat_id = seat.id
		WHERE e.class_id = $1 AND e.status = 'ACTIVE'
		ORDER BY u.name
	`, classId)
	if err != nil {
		span.RecordError(err)
		return nil, err
	}
	defer rows.Close()

	var students []map[string]interface{}
	for rows.Next() {
		var id, name, nim, status string
		var seatNumber sql.NullString
		if err := rows.Scan(&id, &name, &nim, &status, &seatNumber); err != nil {
			continue
		}
		student := map[string]interface{}{
			"id": id, "name": name, "nim": nim, "status": status,
		}
		// Only add seatNumber if it's not NULL
		if seatNumber.Valid {
			student["seatNumber"] = seatNumber.String
		}
		students = append(students, student)
	}
	return students, nil
}

// RegisterUser creates a new user account (pending approval for students)
func RegisterUser(ctx context.Context, req RegisterRequest) error {
	ctx, span := tracer.Start(ctx, "RegisterUser")
	defer span.End()
	span.SetAttributes(attribute.String("user.nim", req.NimNidn))

	// Default to STUDENT role if not specified
	if req.Role == "" {
		req.Role = "STUDENT"
	}

	// Check if email or NIM already exists
	var exists bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 OR nim_nidn = $2)
	`, req.Email, req.NimNidn).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check existing user: %v", err)
	}
	if exists {
		return errors.New("EMAIL_OR_NIM_ALREADY_EXISTS")
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Generate UUID for user
	userId := uuid.New().String()

	// Insert user (trigger will auto-approve if MENTOR/ADMIN)
	// For STUDENT, will remain approved=false
	passwordHash, err := bcrypt.GenerateFromPassword(
		[]byte(req.Password),
		bcrypt.DefaultCost,
	)
	if err != nil {
		return fmt.Errorf("failed to hash password: %v", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO users (id, nim_nidn, name, email, password_hash, role, approved, approval_status)
		VALUES ($1, $2, $3, $4, $5, $6, false, 'PENDING')
	`, userId, req.NimNidn, req.Name, req.Email, string(passwordHash), req.Role)
	if err != nil {
		return fmt.Errorf("failed to create user: %v", err)
	}

	// If student, create student record
	if req.Role == "STUDENT" {
		studentId := uuid.New().String()
		_, err = tx.ExecContext(ctx, `
			INSERT INTO students (id, user_id, major, semester, gpa, max_credits)
			VALUES ($1, $2, $3, 1, 0.00, 24)
		`, studentId, userId, req.Major)
		if err != nil {
			return fmt.Errorf("failed to create student record: %v", err)
		}
	}

	return tx.Commit()
}

func UpdateWorkshopQuota(ctx context.Context, userId, classId string, newQuota int) error {
	ctx, span := tracer.Start(ctx, "UpdateWorkshopQuota")
	defer span.End()
	span.SetAttributes(
		attribute.String("user.id", userId),
		attribute.String("class.id", classId),
		attribute.Int("new_quota", newQuota),
	)

	// Verify and check usage
	var enrolledCount int
	err := db.QueryRowContext(ctx, `
		SELECT enrolled_count 
		FROM workshop_sessions cl
		JOIN mentors l ON cl.mentor_id = l.id
		WHERE cl.id = $1 AND l.user_id = $2
	`, classId, userId).Scan(&enrolledCount)

	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("CLASS_NOT_FOUND_OR_UNAUTHORIZED")
		}
		span.RecordError(err)
		return err
	}

	if newQuota < enrolledCount {
		return fmt.Errorf("QUOTA_TOO_SMALL: current enrollment is %d", enrolledCount)
	}

	// Start Transaction for Atomicity involving Seats
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE workshop_sessions
		SET quota = $1
		WHERE id = $2
	`, newQuota, classId)
	if err != nil {
		return fmt.Errorf("failed to update workshop quota: %v", err)
	}

	// Broadcast seat refresh notification
	// The database trigger has regenerated seats, notify all clients
	// notifyAll("SEATS_REGENERATED", map[string]interface{}{
	// 	"sessionId": classId,
	// 	"newQuota":  newQuota,
	// 	"message":   "Seats have been updated. Refreshing...",
	// })

	// Manually conform seats to new quota (since trigger V12 disabled auto-regen)
	if err := SyncSeatsWithQuota(ctx, tx, classId, newQuota); err != nil {
		span.RecordError(err)
		return err
	}

	if err = tx.Commit(); err != nil {
		return err
	}

	// Notify after commit
	notifyAll("SEATS_REGENERATED", map[string]interface{}{
		"sessionId": classId,
		"newQuota":  newQuota,
		"message":   "Seats have been updated. Refreshing...",
	})

	log.Printf("Quota updated to %d for session %s, seats synced manually", newQuota, classId)

	return nil
}

// DBExecutor interface to support both sql.DB and sql.Tx
type DBExecutor interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// SyncSeatsWithQuota ensures the number of seats matches the quota
// It adds seats (sequentially A1..A10, B1..) or removes ENABLED-BUT-EMPTY seats from the end
func SyncSeatsWithQuota(ctx context.Context, db DBExecutor, sessionId string, newQuota int) error {
	ctx, span := tracer.Start(ctx, "SyncSeatsWithQuota")
	defer span.End()

	// 1. Get current seats
	rows, err := db.QueryContext(ctx, `
		SELECT id, seat_number, row_letter, column_number, status 
		FROM seats 
		WHERE workshop_session_id = $1 
		ORDER BY row_letter, column_number
	`, sessionId)
	if err != nil {
		return err
	}
	defer rows.Close()

	var seats []Seat
	for rows.Next() {
		var s Seat
		if err := rows.Scan(&s.ID, &s.SeatNumber, &s.RowLetter, &s.ColumnNumber, &s.Status); err != nil {
			return err
		}
		seats = append(seats, s)
	}

	currentCount := len(seats)

	// 2. Identify seats to ADD
	if currentCount < newQuota {
		seatsNeeded := newQuota - currentCount
		log.Printf("[SyncSeats] Adding %d seats to reach quota %d", seatsNeeded, newQuota)

		// Define layout strategy: 10 columns per row
		const colsPerRow = 10

		// We append new seats starting from the next logical index
		// 'currentCount' is effectively the index of the next seat (0-based)
		nextIndex := currentCount

		for i := 0; i < seatsNeeded; i++ {
			absIndex := nextIndex + i

			// Calculate Row and Col
			rowIndex := absIndex / colsPerRow
			colNumber := (absIndex % colsPerRow) + 1

			// Generate Row Letter (A, B, ... Z, AA, AB ...)
			// Simple logic for A-Z (0-25)
			// For >26 rows, we need a better converter, but for now assuming < 26 rows (260 seats)
			var rowLetter string
			if rowIndex < 26 {
				rowLetter = string(rune('A' + rowIndex))
			} else {
				// Fallback for huge classes: AA, AB...
				// rowIndex 26 -> AA
				firstChar := string(rune('A' + (rowIndex / 26) - 1))
				secondChar := string(rune('A' + (rowIndex % 26)))
				rowLetter = firstChar + secondChar
			}

			seatNumber := fmt.Sprintf("%s%d", rowLetter, colNumber)

			// Insert new seat
			// Use UPSERT to allow filling gaps if we have holes in IDs but unique constraints match
			_, err := db.ExecContext(ctx, `
				INSERT INTO seats (id, workshop_session_id, seat_number, row_letter, column_number, status)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AVAILABLE')
				ON CONFLICT (workshop_session_id, seat_number) DO NOTHING
			`, sessionId, seatNumber, rowLetter, colNumber)

			if err != nil {
				return fmt.Errorf("failed to generate seat %s: %v", seatNumber, err)
			}
		}

		// 3. Identify seats to REMOVE
	} else if currentCount > newQuota {
		seatsToRemoveCount := currentCount - newQuota
		log.Printf("[SyncSeats] Removing %d seats to reduce quota to %d", seatsToRemoveCount, newQuota)

		// Strategy: Remove from the END (highest Row/Col) first.
		// Filter only AVAILABLE seats.
		// 'seats' slice is already ordered by row_letter, column_number ASC

		removed := 0
		// Iterate backwards
		for i := len(seats) - 1; i >= 0; i-- {
			if removed >= seatsToRemoveCount {
				break
			}

			s := seats[i]
			// Only remove if it is NOT occupied/reserved
			if s.Status == "AVAILABLE" {
				_, err := db.ExecContext(ctx, `DELETE FROM seats WHERE id = $1`, s.ID)
				if err != nil {
					return fmt.Errorf("failed to remove seat %s: %v", s.SeatNumber, err)
				}
				removed++
			}
		}

		if removed < seatsToRemoveCount {
			return fmt.Errorf("CANNOT_REDUCE_QUOTA: Only %d seats could be removed. %d seats are currently occupied or reserved.", removed, (seatsToRemoveCount - removed))
		}
	}

	return nil
}

func GetCurrentTimestamp() string {
	return time.Now().Format(time.RFC3339)
}

// MarkPastWorkshopsDone marks workshops with past month/year as 'done'
func MarkPastWorkshopsDone(ctx context.Context) (int, error) {
	now := time.Now()
	currentMonth := int(now.Month())
	currentYear := now.Year()

	result, err := db.ExecContext(ctx, `
		UPDATE workshop_sessions 
		SET status = 'done' 
		WHERE COALESCE(status, 'active') = 'active'
		AND (year < $1 OR (year = $1 AND month < $2))
	`, currentYear, currentMonth)
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	if rows > 0 {
		log.Printf("[WORKSHOP] Marked %d past workshops as done", rows)
	}
	return int(rows), nil
}

// startPastWorkshopChecker runs a background worker to mark past workshops as done
func startPastWorkshopChecker() {
	// Run once at startup
	MarkPastWorkshopsDone(context.Background())

	// Then check every hour
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		MarkPastWorkshopsDone(context.Background())
	}
}

// GetQueueActiveUserDetails returns details of users currently in active slots
func GetQueueActiveUserDetails(ctx context.Context) ([]map[string]interface{}, error) {
	// Get user IDs from Redis active_slots set
	userIds, err := redisClient.SMembers(ctx, "active_slots").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get active slots: %v", err)
	}

	if len(userIds) == 0 {
		return []map[string]interface{}{}, nil
	}

	// Query user details from DB
	var users []map[string]interface{}
	for _, uid := range userIds {
		var name, email, nimNidn string
		err := db.QueryRowContext(ctx, `
			SELECT name, email, nim_nidn FROM users WHERE id = $1
		`, uid).Scan(&name, &email, &nimNidn)
		if err != nil {
			continue // Skip if user not found (stale redis data?)
		}
		users = append(users, map[string]interface{}{
			"id":      uid,
			"name":    name,
			"email":   email,
			"nimNidn": nimNidn,
		})
	}

	if users == nil {
		users = []map[string]interface{}{}
	}
	return users, nil
}

// GetQueueWaitingUserDetails returns details of users in the waiting queue
func GetQueueWaitingUserDetails(ctx context.Context) ([]map[string]interface{}, error) {
	// Get user IDs from Redis waiting_queue sorted set (ordered by score/join time)
	// ZRangeWithScores returns members with scores, but we just need members for now?
	// Actually we just need IDs to look up.
	members, err := redisClient.ZRange(ctx, "waiting_queue", 0, -1).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get waiting queue: %v", err)
	}

	if len(members) == 0 {
		return []map[string]interface{}{}, nil
	}

	var users []map[string]interface{}
	// Range returns []string of members
	for i, uid := range members {
		var name, email, nimNidn string
		err := db.QueryRowContext(ctx, `
			SELECT name, email, nim_nidn FROM users WHERE id = $1
		`, uid).Scan(&name, &email, &nimNidn)
		if err != nil {
			continue
		}
		users = append(users, map[string]interface{}{
			"id":       uid,
			"name":     name,
			"email":    email,
			"nimNidn":  nimNidn,
			"position": i + 1,
		})
	}

	if users == nil {
		users = []map[string]interface{}{}
	}
	return users, nil
}

// Kafka Telemetry Helpers

type KafkaHeaderCarrier []kafka.Header

func (c *KafkaHeaderCarrier) Get(key string) string {
	for _, h := range *c {
		if h.Key == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c *KafkaHeaderCarrier) Set(key string, value string) {
	// Remove existing header with same key if present
	for i, h := range *c {
		if h.Key == key {
			(*c)[i].Value = []byte(value)
			return
		}
	}
	*c = append(*c, kafka.Header{
		Key:   key,
		Value: []byte(value),
	})
}

func (c *KafkaHeaderCarrier) Keys() []string {
	keys := make([]string, len(*c))
	for i, h := range *c {
		keys[i] = h.Key
	}
	return keys
}

func publishKafkaMessage(ctx context.Context, msg kafka.Message) error {
	ctx, span := tracer.Start(ctx, fmt.Sprintf("kafka.publish %s", kafkaWriter.Topic))
	defer span.End()

	// Inject trace context into headers
	carrier := KafkaHeaderCarrier(msg.Headers)
	otel.GetTextMapPropagator().Inject(ctx, &carrier)
	msg.Headers = []kafka.Header(carrier)

	span.SetAttributes(
		attribute.String("messaging.system", "kafka"),
		attribute.String("messaging.destination", kafkaWriter.Topic),
		attribute.String("messaging.operation", "publish"),
	)

	err := kafkaWriter.WriteMessages(ctx, msg)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}
