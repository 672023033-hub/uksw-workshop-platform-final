package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/segmentio/kafka-go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

// QueueEvent represents the structure of queue events from Kafka
type QueueEvent struct {
	UserID    string `json:"userId"`
	Event     string `json:"event"` // ACTIVATED, QUEUED, PROMOTED
	Position  int    `json:"position,omitempty"`
	Timestamp string `json:"timestamp"`
}

var kafkaReader *kafka.Reader

// initKafkaConsumer initializes the Kafka reader for consuming queue events
func initKafkaConsumer() { // kode program 6 : Baris 42–74
	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:9092"
	}

	kafkaReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers:        []string{kafkaBrokers},
		Topic:          "queue.join",
		GroupID:        "queue-processor",
		Dialer:         getKafkaDialer(), // Use custom dialer
		MinBytes:       10e3,             // 10KB
		MaxBytes:       10e6,             // 10MB
		CommitInterval: time.Second,
		StartOffset:    kafka.LastOffset,
	})

	log.Printf("Kafka consumer initialized - Brokers: %s, Topic: queue.join, GroupID: queue-processor", kafkaBrokers)
}

// startKafkaConsumer runs a background goroutine that consumes messages from Kafka
func startKafkaConsumer() {
	// Initialize the consumer
	initKafkaConsumer()

	log.Println("Kafka consumer started - listening for queue events...")

	for {
		// Create context for each message consumption
		ctx := context.Background()

		// Read message from Kafka
		msg, err := kafkaReader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Kafka consumer error: %v", err)
			time.Sleep(time.Second) // Wait before retrying
			continue
		}

		// Process the message with tracing
		processKafkaMessage(ctx, msg)
	}
}

// processKafkaMessage processes a single Kafka message with OpenTelemetry tracing
func processKafkaMessage(ctx context.Context, msg kafka.Message) {
	// Start a new span for consuming
	ctx, span := tracer.Start(ctx, "kafka.consume queue.join")
	defer span.End()

	// Add span attributes
	span.SetAttributes(
		attribute.String("messaging.system", "kafka"),
		attribute.String("messaging.destination", "queue.join"),
		attribute.String("messaging.operation", "receive"),
		attribute.Int64("messaging.kafka.partition", int64(msg.Partition)),
		attribute.Int64("messaging.kafka.offset", msg.Offset),
	)

	// Parse the event
	var event QueueEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		log.Printf("Failed to parse queue event: %v", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, "Failed to parse event")
		return
	}

	// Add event details to span
	span.SetAttributes(
		attribute.String("queue.user_id", event.UserID),
		attribute.String("queue.event_type", event.Event),
		attribute.Int("queue.position", event.Position),
	)

	// Process based on event type
	processQueueEvent(ctx, event)

	log.Printf("Consumed queue event: %s for user %s (position: %d)", event.Event, event.UserID, event.Position)
}

// processQueueEvent handles the business logic for each event type
func processQueueEvent(ctx context.Context, event QueueEvent) {
	ctx, span := tracer.Start(ctx, "processQueueEvent")
	defer span.End()

	span.SetAttributes(
		attribute.String("event.type", event.Event),
		attribute.String("user.id", event.UserID),
	)

	switch event.Event {
	case "REQUEST_JOIN": // kode program 7 : menunjukkan proses pemrosesan event REQUEST_JOIN oleh Kafka Consumer.
		// This is the queue processing logic.
		for {
			// Check if user is already active
			isActive, _ := redisClient.SIsMember(ctx, "active_slots", event.UserID).Result()
			if isActive {
				log.Printf("[QUEUE] User %s already active (promoted by another worker), skipping wait", event.UserID)

				// Ensure they are removed from waiting_queue ZSET
				redisClient.ZRem(ctx, "waiting_queue", event.UserID)

				// Still send notification just in case they are waiting for it
				payload := map[string]interface{}{
					"message": "Access granted! Redirecting...",
					"status":  "ACTIVE",
				}
				notifyUser(event.UserID, "ACCESS_GRANTED", payload)
				notifyUser(event.UserID, "AUTO_PROMOTE", payload)
				break
			}

			// ATOMIC check-and-add: check if slot available and add in one operation
			added, err := atomicAddToActiveSlotsIfSpace(ctx, event.UserID)
			if err != nil {
				log.Printf("Error in atomic slot assignment for user %s: %v", event.UserID, err)
				time.Sleep(1 * time.Second)
				continue
			}

			if added {
				// Slot was available and user was added atomically!
				// REMOVE from waiting_queue ZSET as they are now active
				redisClient.ZRem(ctx, "waiting_queue", event.UserID)

				log.Printf("[QUEUE PROCESSED] User %s ACTIVATED (Wait ended)", event.UserID)
				span.SetAttributes(attribute.String("action", "user_activated_from_queue"))

				// SEND WEBSOCKET NOTIFICATION for real-time redirect
				payload := map[string]interface{}{
					"message": "Your turn! Redirecting to workshop selection...",
					"status":  "ACTIVE",
				}
				notifyUser(event.UserID, "ACCESS_GRANTED", payload)
				notifyUser(event.UserID, "AUTO_PROMOTE", payload)

				// BROADCAST queue update
				limit := getQueueLimit()
				activeCount, _ := redisClient.SCard(ctx, "active_slots").Result()
				newWaitingCount, _ := redisClient.ZCard(ctx, "waiting_queue").Result()
				notifyAll("QUEUE_POSITION", map[string]interface{}{
					"position":             int(newWaitingCount),
					"activeCount":          activeCount,
					"limit":                limit,
					"estimatedWaitMinutes": calculateETA(int(newWaitingCount)),
				})

				break
			}

			// Slot still full, wait and retry (Blocking the partition consumer)
			span.AddEvent("waiting_for_slot")
			time.Sleep(1 * time.Second)
		}

	case "ACTIVATED":
		// User was directly activated (had available slot)
		span.SetAttributes(attribute.String("action", "user_activated_directly"))
		log.Printf("[QUEUE EVENT] User %s ACTIVATED - direct access to course selection", event.UserID)

		// Also notify via WebSocket just in case they are already on the queue page
		payload := map[string]interface{}{
			"message": "Access granted! Redirecting...",
			"status":  "ACTIVE",
		}
		notifyUser(event.UserID, "ACCESS_GRANTED", payload)
		notifyUser(event.UserID, "AUTO_PROMOTE", payload)

	case "QUEUED":
		// User was added to waiting queue
		span.SetAttributes(
			attribute.String("action", "user_added_to_queue"),
			attribute.Int("queue.position", event.Position),
		)
		log.Printf("[QUEUE EVENT] User %s QUEUED at position %d", event.UserID, event.Position)

		// Broadcast new queue size
		waitingCount, _ := redisClient.ZCard(ctx, "waiting_queue").Result()
		notifyAll("QUEUE_POSITION", map[string]interface{}{
			"position":    int(waitingCount),
			"activeCount": -1, // Unknown exactly without SCard, but that's okay
		})

	case "PROMOTED":
		// User was promoted from waiting to active (e.g. via promoteWaitingUsers)
		span.SetAttributes(attribute.String("action", "user_promoted_to_active"))
		log.Printf("[QUEUE EVENT] User %s PROMOTED - now has access to course selection", event.UserID)

		// Must notify the user so they can redirect!
		payload := map[string]interface{}{
			"message": "You have been promoted! Redirecting...",
			"status":  "ACTIVE",
		}
		notifyUser(event.UserID, "ACCESS_GRANTED", payload)
		notifyUser(event.UserID, "AUTO_PROMOTE", payload)

		// Broadcast queue update so remaining users see their position decrease
		newWaitingCount, _ := redisClient.ZCard(ctx, "waiting_queue").Result()
		notifyAll("QUEUE_POSITION", map[string]interface{}{
			"position":             int(newWaitingCount),
			"estimatedWaitMinutes": calculateETA(int(newWaitingCount)),
		})

	default:
		log.Printf("[QUEUE EVENT] Unknown event type: %s for user %s", event.Event, event.UserID)
		span.SetAttributes(attribute.String("action", "unknown_event"))
	}
}

// stopKafkaConsumer gracefully closes the Kafka reader
func stopKafkaConsumer() {
	if kafkaReader != nil {
		if err := kafkaReader.Close(); err != nil {
			log.Printf("Error closing Kafka consumer: %v", err)
		} else {
			log.Println("Kafka consumer stopped gracefully")
		}
	}
}
