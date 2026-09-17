package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Authentication Handlers
func handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role" binding:"required,oneof=STUDENT MENTOR"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	// Authenticate user (calls auth service)
	user, token, err := AuthenticateUser(c.Request.Context(), req.Username, req.Password, req.Role)
	if err != nil {
		if err.Error() == "ACCOUNT_PENDING_APPROVAL" {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "ACCOUNT_PENDING_APPROVAL",
				"message": "Your account is pending approval. Please wait for a mentor to approve your registration.",
			})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "INVALID_CREDENTIALS",
				"message": "Invalid username or password",
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   token,
		"user": gin.H{
			"id":   user.ID,
			"nim":  user.NIM,
			"name": user.Name,
			"role": user.Role,
		},
		"expiresIn": 7200,
	})
}

func handleLogout(c *gin.Context) {
	// Extract token to invalidate
	// Extract token to invalidate
	// authHeader := c.GetHeader("Authorization")
	// if authHeader != "" {
	// 	tokenParts := strings.Split(authHeader, " ")
	// 	if len(tokenParts) == 2 {
	// 		// token := tokenParts[1]
	// 		// For now we rely on AuthMiddleware to get userId
	// 	}
	// }

	userId, exists := c.Get("userId")
	if exists {
		// Remove from Queue
		LeaveQueue(c.Request.Context(), userId.(string))

		// Invalidate Session (Optional, since we rely on overwriting or TTL, but explicit delete is good)
		// We'll define InvalidateSession in services
		InvalidateSession(userId.(string))
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logged out successfully",
	})
}

func handleRegister(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	err := RegisterUser(c.Request.Context(), req)
	if err != nil {
		if err.Error() == "EMAIL_OR_NIM_ALREADY_EXISTS" {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "EMAIL_OR_NIM_ALREADY_EXISTS",
				"message": "Email or NIM already registered",
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "REGISTRATION_FAILED",
				"message": err.Error(),
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Registration successful! Please wait for mentor approval before logging in.",
	})
}

// Queue Handlers
func handleJoinQueue(c *gin.Context) {
	role, _ := c.Get("role")
	userId, _ := c.Get("userId")

	// Mentors bypass the queue
	// Mentors bypass the queue
	if role == "MENTOR" {
		// Ensure they are not counted in the queue
		LeaveQueue(c.Request.Context(), userId.(string))
		c.JSON(http.StatusOK, gin.H{
			"success":              true,
			"queuePosition":        0,
			"estimatedWaitMinutes": 0,
			"timestamp":            GetCurrentTimestamp(),
			"message":              "Mentors skip the queue",
		})
		return
	}

	position, eta, err := JoinQueue(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "QUEUE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"queuePosition":        position,
		"estimatedWaitMinutes": eta,
		"timestamp":            GetCurrentTimestamp(),
	})
}

func handleQueueStatus(c *gin.Context) {
	userId, _ := c.Get("userId")
	role, _ := c.Get("role")

	// Mentors always active
	if role == "MENTOR" {
		LeaveQueue(c.Request.Context(), userId.(string)) // Cleanup if present
		c.JSON(http.StatusOK, gin.H{
			"inQueue":              true,
			"position":             0,
			"status":               "ACTIVE",
			"estimatedWaitMinutes": 0,
			"timestamp":            GetCurrentTimestamp(),
		})
		return
	}

	status, err := GetQueueStatus(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "QUEUE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, status)
}

func handleQueueMetrics(c *gin.Context) {
	metrics, err := GetQueueMetricsAndLimit(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "QUEUE_ERROR",
			"message": err.Error(),
		})
		return
	}

	activeCount := metrics["activeUsers"].(int64)
	waitingCount := metrics["waitingUsers"].(int64)
	limit := metrics["limit"].(int)

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"activeUsers":  activeCount,
		"waitingUsers": waitingCount,
		"totalUsers":   activeCount + waitingCount,
		"limit":        limit,
		"timestamp":    GetCurrentTimestamp(),
	})
}

func handleHeartbeat(c *gin.Context) {
	userId, _ := c.Get("userId")

	// Check heartbeat and get remaining TTL
	ttl, err := Heartbeat(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "NOT_ACTIVE",
			"message": "You are not in an active session",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"message":          "Session active",
		"remainingSeconds": ttl,
		"timestamp":        GetCurrentTimestamp(),
	})
}

func handleSetQueueLimit(c *gin.Context) {
	var req struct {
		Limit int `json:"limit" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	if err := SetQueueLimit(req.Limit); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "UPDATE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Queue limit updated successfully",
		"limit":   req.Limit,
	})
}

func handleGetQueueActiveUsers(c *gin.Context) {
	users, err := GetQueueActiveUserDetails(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "FETCH_FAILED",
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   users,
		"count":   len(users),
	})
}

func handleGetQueueWaitingUsers(c *gin.Context) {
	users, err := GetQueueWaitingUserDetails(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "FETCH_FAILED",
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   users,
		"count":   len(users),
	})
}

// Workshop Handlers
func handleGetAvailableWorkshops(c *gin.Context) {
	semester := c.DefaultQuery("semester", "GASAL_2024")
	faculty := c.Query("faculty")
	page := c.DefaultQuery("page", "1")
	limit := c.DefaultQuery("limit", "20")

	courses, pagination, err := GetAvailableWorkshops(c.Request.Context(), semester, faculty, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"workshops":  courses,
		"pagination": pagination,
	})
}

func handleGetWorkshopDetails(c *gin.Context) {
	courseId := c.Param("id")

	course, err := GetWorkshopDetails(c.Request.Context(), courseId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Workshop not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"course":  course,
	})
}

// Enrollment Handlers
func handleEnrollWorkshop(c *gin.Context) {
	userId, _ := c.Get("userId")

	var req struct {
		ClassID string `json:"classId" binding:"required"`
		SeatID  string `json:"seatId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	enrollment, totalCredits, err := AddWorkshopEnrollment(c.Request.Context(), userId.(string), req.ClassID, req.SeatID)
	if err != nil {
		// Handle specific errors
		if err.Error() == "REGISTRATION_NOT_OPEN" {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"success": false,
				"error":   "REGISTRATION_NOT_OPEN",
				"message": "Registration for this workshop has not opened yet",
			})
			return
		}
		if err.Error() == "REGISTRATION_CLOSED" {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"success": false,
				"error":   "REGISTRATION_CLOSED",
				"message": "Registration for this workshop is closed",
			})
			return
		}
		if err.Error() == "QUOTA_EXCEEDED" {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "QUOTA_EXCEEDED",
				"message": "Workshop is already full",
			})
			return
		}
		if err.Error() == "CREDIT_LIMIT_EXCEEDED" {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "CREDIT_LIMIT_EXCEEDED",
				"message": "Maximum 24 SKS limit reached",
			})
			return
		}
		if err.Error() == "SCHEDULE_CONFLICT" {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "SCHEDULE_CONFLICT",
				"message": "Time conflict with existing course",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "ENROLLMENT_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"enrollment":   enrollment,
		"totalCredits": totalCredits,
	})
}

func handleDropWorkshop(c *gin.Context) {
	userId, _ := c.Get("userId")
	enrollmentId := c.Param("id")

	err := DropWorkshopEnrollment(c.Request.Context(), userId.(string), enrollmentId)
	if err != nil {
		if err.Error() == "REGISTRATION_CLOSED" {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"success": false,
				"error":   "REGISTRATION_CLOSED",
				"message": "Registration has closed. You cannot drop this workshop.",
			})
			return
		}
		if err.Error() == "ENROLLMENT_NOT_FOUND" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "ENROLLMENT_NOT_FOUND",
				"message": "Enrollment not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DROP_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Workshop dropped successfully",
	})
}

func handleGetMyWorkshops(c *gin.Context) {
	userId, _ := c.Get("userId")

	courses, err := GetStudentWorkshops(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	// Ensure courses is not nil - return empty array if no enrollments
	if courses == nil {
		courses = []Enrollment{}
	}

	// Calculate total credits
	totalCredits := 0
	for _, course := range courses {
		totalCredits += course.Credits
	}

	// Get student max credits
	var maxCredits int
	err = db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(max_credits, 24) FROM students WHERE user_id = $1
	`, userId).Scan(&maxCredits)
	if err != nil {
		maxCredits = 24 // Fallback if error (e.g. user is mentor testing as student)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"workshops":    courses,
		"totalCredits": totalCredits,
		"maxCredits":   maxCredits,
	})
}

func handleRateWorkshop(c *gin.Context) {
	enrollmentId := c.Param("id")
	userId, _ := c.Get("userId")

	var req struct {
		Rating int    `json:"rating" binding:"required,min=1,max=5"`
		Review string `json:"review"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	err := RateWorkshop(c.Request.Context(), userId.(string), enrollmentId, req.Rating, req.Review)
	if err != nil {
		status := http.StatusInternalServerError
		errorPayload := gin.H{
			"success": false,
			"error":   "RATING_FAILED",
			"message": err.Error(),
		}

		if err.Error() == "WORKSHOP_NOT_STARTED_YET" || err.Error() == "WORKSHOP_NOT_YET_COMPLETED" {
			status = http.StatusConflict
			errorPayload["error"] = "NOT_COMPLETED"
			errorPayload["message"] = "You can only rate workshops after they are completed."
		} else if err.Error() == "ENROLLMENT_NOT_FOUND" {
			status = http.StatusNotFound
			errorPayload["error"] = "NOT_FOUND"
			errorPayload["message"] = "Enrollment not found."
		}

		c.JSON(status, errorPayload)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Workshop rated successfully",
	})
}

func handleGetEnrollmentHistory(c *gin.Context) {
	userId, _ := c.Get("userId")

	history, err := GetStudentEnrollmentHistory(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "FETCH_FAILED",
			"message": err.Error(),
		})
		return
	}

	if history == nil {
		history = []Enrollment{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"history": history,
	})
}

// Mentor Handlers
func handleGetMentorWorkshops(c *gin.Context) {
	userId, _ := c.Get("userId")

	courses, err := GetMentorWorkshops(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"workshops": courses,
	})
}

func handleGetEnrolledStudents(c *gin.Context) {
	classId := c.Param("id")

	students, err := GetWorkshopEnrolledStudents(c.Request.Context(), classId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"students": students,
	})
}

func handleUpdateClassQuota(c *gin.Context) {
	var req struct {
		ClassID string `json:"classId" binding:"required"`
		Quota   int    `json:"quota" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	userId, _ := c.Get("userId")
	err := UpdateWorkshopQuota(c.Request.Context(), userId.(string), req.ClassID, req.Quota)
	if err != nil {
		if strings.Contains(err.Error(), "QUOTA_TOO_SMALL") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "INVALID_QUOTA",
				"message": err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "UPDATE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Quota updated successfully"})
}

func handleCreateClass(c *gin.Context) {
	var req CreateClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	userId, _ := c.Get("userId")
	sessionId, err := CreateWorkshop(c.Request.Context(), userId.(string), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "CREATE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "Workshop created successfully",
		"sessionId": sessionId,
	})
}

func handleUpdateWorkshop(c *gin.Context) {
	sessionId := c.Param("id")
	userId, _ := c.Get("userId")

	var req UpdateWorkshopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	err := UpdateWorkshopSession(c.Request.Context(), sessionId, userId.(string), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "UPDATE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Workshop updated successfully",
	})
}

// Credit Limit Management Handlers
func handleGetAllStudents(c *gin.Context) {
	userId, _ := c.Get("userId")

	students, err := GetAllStudents(c.Request.Context(), userId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"students": students,
	})
}

func handleUpdateStudentCreditLimit(c *gin.Context) {
	mentorUserId, _ := c.Get("userId")
	studentUserId := c.Param("studentId")

	var req struct {
		MaxCredits int `json:"maxCredits" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	err := UpdateStudentCreditLimit(c.Request.Context(), mentorUserId.(string), studentUserId, req.MaxCredits)
	if err != nil {
		if strings.Contains(err.Error(), "INVALID_CREDIT_LIMIT") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "INVALID_CREDIT_LIMIT",
				"message": err.Error(),
			})
			return
		}
		if strings.Contains(err.Error(), "STUDENT_NOT_FOUND") {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "STUDENT_NOT_FOUND",
				"message": "Student not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "UPDATE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Credit limit updated successfully",
	})
}

// handleGetMentorFeedback returns aggregated student feedback for all of this mentor's workshops
func handleGetMentorFeedback(c *gin.Context) {
	mentorUserId, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false, "error": "UNAUTHORIZED",
		})
		return
	}

	summary, err := GetMentorFeedbackSummary(c.Request.Context(), mentorUserId.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "FETCH_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"totalRatings":   summary.TotalRatings,
		"overallAverage": summary.OverallAvg,
		"workshops":      summary.Workshops,
	})
}

// ─── Password Reset Handlers ─────────────────────────────────────────────────

func handleRequestPasswordReset(c *gin.Context) {
	var req struct {
		NIM         string `json:"nim" binding:"required"`
		Email       string `json:"email" binding:"required"`
		NewPassword string `json:"newPassword" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "INVALID_REQUEST", "message": err.Error()})
		return
	}

	err := RequestPasswordReset(c.Request.Context(), req.NIM, req.Email, req.NewPassword)
	if err != nil {
		if err.Error() == "USER_NOT_FOUND" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "USER_NOT_FOUND", "message": "No account found with that NIM and email combination."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "RESET_FAILED", "message": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Password reset request submitted. Please wait for mentor approval."})
}

func handleGetPasswordResetRequests(c *gin.Context) {
	status := c.DefaultQuery("status", "PENDING")
	requests, err := GetPasswordResetRequests(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "FETCH_FAILED", "message": err.Error()})
		return
	}
	if requests == nil {
		requests = []PasswordResetRequest{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "requests": requests, "count": len(requests)})
}

func handleApprovePasswordReset(c *gin.Context) {
	requestID := c.Param("id")
	if requestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "INVALID_REQUEST", "message": "Request ID is required"})
		return
	}
	err := ApprovePasswordReset(c.Request.Context(), requestID)
	if err != nil {
		if err.Error() == "REQUEST_NOT_FOUND" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "NOT_FOUND", "message": "Reset request not found or already processed."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "APPROVE_FAILED", "message": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Password updated successfully."})
}

func handleRejectPasswordReset(c *gin.Context) {
	requestID := c.Param("id")
	if requestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "INVALID_REQUEST", "message": "Request ID is required"})
		return
	}
	err := RejectPasswordReset(c.Request.Context(), requestID)
	if err != nil {
		if err.Error() == "REQUEST_NOT_FOUND" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "NOT_FOUND", "message": "Reset request not found or already processed."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "REJECT_FAILED", "message": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Password reset request rejected."})
}
