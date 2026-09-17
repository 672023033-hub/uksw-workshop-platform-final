package main

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// CORS Middleware
func CORSMiddleware(allowOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Dynamic origin handling to support wildcard with credentials
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			// Fallback to configured origin or *
			if allowOrigin == "" {
				allowOrigin = "*"
			}
			c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, expires, pragma, ngrok-skip-browser-warning")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// Rate Limiter using token bucket algorithm
var (
	limiters = make(map[string]*rate.Limiter)
	mu       sync.Mutex
)

func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		limiter, exists := limiters[ip]
		if !exists {
			// Allow 100 requests per minute
			limiter = rate.NewLimiter(rate.Every(time.Minute/100), 20)
			limiters[ip] = limiter
		}
		mu.Unlock()

		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":   "RATE_LIMIT_EXCEEDED",
				"message": "Too many requests. Please try again later.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Authentication Middleware
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := ""
		authHeader := c.GetHeader("Authorization")

		if authHeader != "" {
			// Extract token from header
			tokenParts := strings.Split(authHeader, " ")
			if len(tokenParts) == 2 && tokenParts[0] == "Bearer" {
				token = tokenParts[1]
			}
		}

		// Fallback: Check for WebSocket token (query param)
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "UNAUTHORIZED",
				"message": "Missing authorization token",
			})
			c.Abort()
			return
		}

		// Validate token (implement JWT validation)
		claims, err := ValidateJWT(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "INVALID_TOKEN",
				"message": "Token validation failed",
			})
			c.Abort()
			return
		}

		// Single Session Enforcement
		// Check if the token matches the active token in Redis
		// We define context here as we are in a handler
		// redisClient is global from main package
		storedToken, err := redisClient.Get(c, "active_token:"+claims.UserID).Result()
		if err != nil || storedToken != token {
			// Remove from queue if session is invalid/expired
			LeaveQueue(c.Request.Context(), claims.UserID)

			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "SESSION_EXPIRED",
				"message": "Session expired or logged in identifying from another device",
			})
			c.Abort()
			return
		}

		// Set user info in context
		c.Set("userId", claims.UserID)
		c.Set("role", claims.Role)
		c.Set("nim", claims.NIM)

		c.Next()
	}
}

// Role-based access control
func RequireRole(requiredRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role != requiredRole {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "FORBIDDEN",
				"message": "Insufficient permissions",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Enforce Queue Status
func RequireQueueActive() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip for mentors
		role, exists := c.Get("role")
		if exists && role == "MENTOR" {
			c.Next()
			return
		}

		userId, exists := c.Get("userId")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "UNAUTHORIZED",
				"message": "User ID not found in context",
			})
			c.Abort()
			return
		}

		// Check status
		status, err := GetQueueStatus(c.Request.Context(), userId.(string))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "QUEUE_ERROR",
				"message": "Failed to check queue status",
			})
			c.Abort()
			return
		}

		inQueue, _ := status["inQueue"].(bool)
		queueStatus, _ := status["status"].(string)

		if !inQueue || queueStatus != "ACTIVE" {
			c.JSON(http.StatusForbidden, gin.H{
				"error":       "QUEUE_WAITING",
				"message":     "You are currently in the queue. Please wait for your turn.",
				"queueStatus": status,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
