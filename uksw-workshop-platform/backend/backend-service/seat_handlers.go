package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Workshop Seat Handlers

func handleGetWorkshopSeats(c *gin.Context) {
	sessionID := c.Param("id")

	seats, err := GetWorkshopSeats(c.Request.Context(), sessionID)
	if err != nil {
		// Handle specific error cases
		statusCode := http.StatusInternalServerError
		errorCode := "DATABASE_ERROR"

		if err.Error() == "SESSION_ID_REQUIRED" {
			statusCode = http.StatusBadRequest
			errorCode = "INVALID_REQUEST"
		}

		c.JSON(statusCode, gin.H{
			"success": false,
			"error":   errorCode,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"seats":   seats,
	})
}

func handleReserveSeat(c *gin.Context) {
	userID, _ := c.Get("userId")
	seatID := c.Param("id")

	reservation, err := ReserveSeat(c.Request.Context(), userID.(string), seatID)
	if err != nil {
		statusCode := http.StatusInternalServerError
		errorCode := "RESERVATION_FAILED"

		switch err.Error() {
		case "SEAT_NOT_FOUND":
			statusCode = http.StatusNotFound
			errorCode = "SEAT_NOT_FOUND"
		case "SEAT_NOT_AVAILABLE":
			statusCode = http.StatusConflict
			errorCode = "SEAT_NOT_AVAILABLE"
		case "SEAT_LOCKED_BY_ANOTHER_USER":
			statusCode = http.StatusConflict
			errorCode = "SEAT_LOCKED"
		}

		c.JSON(statusCode, gin.H{
			"success": false,
			"error":   errorCode,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"reservation": reservation,
	})
}

func handleReleaseSeat(c *gin.Context) {
	userID, _ := c.Get("userId")
	seatID := c.Param("id")

	err := ReleaseSeatReservation(c.Request.Context(), userID.(string), seatID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "RELEASE_FAILED",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Seat released successfully",
	})
}

func handleGetMySeatReservation(c *gin.Context) {
	userID, _ := c.Get("userId")

	reservation, err := GetUserSeatReservation(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "DATABASE_ERROR",
			"message": err.Error(),
		})
		return
	}

	if reservation == nil {
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"reservation": nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"reservation": reservation,
	})
}
