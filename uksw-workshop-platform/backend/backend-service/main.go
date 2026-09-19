package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

func main() {
	// Load environment variables
	godotenv.Load()

	// Initialize OpenTelemetry Tracer
	shutdown := InitTracer()
	defer func() {
		if err := shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer: %v", err)
		}
	}()

	// Get configuration
	port := getEnv("PORT", "8080")
	corsOrigin := getEnv("CORS_ORIGIN", "http://localhost:5173")

	// Initialize Gin with release mode for production
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()

	// Middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(otelgin.Middleware("backend-service"))
	router.Use(CORSMiddleware(corsOrigin))
	// router.Use(RateLimitMiddleware())

	// Health check endpoint
	router.Any("/health", func(c *gin.Context) {
		log.Println("Health check request received")
		c.JSON(http.StatusOK, gin.H{
			"status": "healthy",
			"time":   time.Now().Format(time.RFC3339),
		})
	})

	// Start background cleanup for expired queue slots
	go startSlotCleanupWorker()

	// Start Kafka consumer for queue events
	go startKafkaConsumer()

	// Start background worker to mark past workshops as done
	go startPastWorkshopChecker()

	// Start WebSocket hub for real-time notifications
	startWebSocketHub()

	// API routes
	setupRoutes(router)

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("API Gateway starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with 5 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func setupRoutes(router *gin.Engine) {
	api := router.Group("/api")
	{
		// Authentication routes
		auth := api.Group("/auth")
		{
			auth.POST("/login", handleLogin)
			auth.POST("/logout", AuthMiddleware(), handleLogout)
		}

		// Public registration route
		api.POST("/register", handleRegister)

		// Public forgot password route
		api.POST("/auth/forgot-password", handleRequestPasswordReset)

		queue := api.Group("/queue")
		queue.Use(AuthMiddleware())
		{
			queue.POST("/join", handleJoinQueue)
			queue.GET("/status", handleQueueStatus)
			queue.GET("/metrics", handleQueueMetrics)
			queue.POST("/heartbeat", handleHeartbeat)
			queue.POST("/limit", RequireRole("MENTOR"), handleSetQueueLimit)
			queue.GET("/active-users", RequireRole("MENTOR"), handleGetQueueActiveUsers)
			queue.GET("/waiting-users", RequireRole("MENTOR"), handleGetQueueWaitingUsers)
		}

		// WebSocket route (outside /api for direct ws:// connection)
		router.GET("/ws", AuthMiddleware(), handleWebSocket)

		// Workshop routes (previously course routes)
		workshops := api.Group("/workshops")
		workshops.Use(AuthMiddleware())
		workshops.Use(RequireQueueActive())
		{
			workshops.GET("/available", handleGetAvailableWorkshops)
			workshops.GET("/:id", handleGetWorkshopDetails)

			// Seat management for workshop sessions
			workshops.GET("/sessions/:id/seats", handleGetWorkshopSeats)
			workshops.POST("/seats/:id/reserve", handleReserveSeat)
			workshops.DELETE("/seats/:id/reserve", handleReleaseSeat)
			workshops.GET("/my-seat-reservation", handleGetMySeatReservation)
		}

		// Enrollment routes — require active queue session for registration actions
		enrollment := api.Group("/enrollment")
		enrollment.Use(AuthMiddleware())
		enrollment.Use(RequireQueueActive())
		{
			enrollment.POST("/add", handleEnrollWorkshop)
			enrollment.DELETE("/:id", handleDropWorkshop)
			enrollment.GET("/my-workshops", handleGetMyWorkshops)
		}

		// Enrollment history & rating — accessible without active queue session
		enrollmentHistory := api.Group("/enrollment")
		enrollmentHistory.Use(AuthMiddleware())
		{
			enrollmentHistory.GET("/history", handleGetEnrollmentHistory)
			enrollmentHistory.POST("/:id/rate", handleRateWorkshop)
		}

		// Mentor routes
		mentor := api.Group("/mentor")
		mentor.Use(AuthMiddleware())
		mentor.Use(RequireRole("MENTOR"))
		{
			mentor.GET("/workshops", handleGetMentorWorkshops)
			mentor.POST("/workshops", handleCreateClass)
			mentor.PUT("/workshops/:id", handleUpdateWorkshop)
			mentor.GET("/workshops/:id/students", handleGetEnrolledStudents)
			mentor.POST("/workshops/quota", handleUpdateClassQuota)
			mentor.POST("/workshops/:id/image", handleUploadWorkshopImage)
			mentor.DELETE("/workshops/:id/image", handleDeleteWorkshopImage)

			// User management routes
			mentor.GET("/users", handleGetAllUsers)
			mentor.POST("/users/:id/approve", handleApproveUser)
			mentor.DELETE("/users/:id", handleRejectRemoveUser)

			// Student credit limit management
			mentor.GET("/students", handleGetAllStudents)
			mentor.PUT("/students/:studentId/credit-limit", handleUpdateStudentCreditLimit)

			// Feedback summary
			mentor.GET("/feedback", handleGetMentorFeedback)

			// Password reset management
			mentor.GET("/password-resets", handleGetPasswordResetRequests)
			mentor.POST("/password-resets/:id/approve", handleApprovePasswordReset)
			mentor.POST("/password-resets/:id/reject", handleRejectPasswordReset)
		}
	}
}
