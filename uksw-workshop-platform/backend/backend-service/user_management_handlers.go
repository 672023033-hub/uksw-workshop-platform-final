package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// User Management Handlers

func handleGetAllUsers(c *gin.Context) {
	filterStatus := c.DefaultQuery("status", "all")

	users, err := GetAllUsers(c.Request.Context(), filterStatus)
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

func handleApproveUser(c *gin.Context) {
	userId := c.Param("id")

	if userId == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": "User ID is required",
		})
		return
	}

	err := ApproveUser(c.Request.Context(), userId)
	if err != nil {
		if err.Error() == "user not found or already approved" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "USER_NOT_FOUND",
				"message": err.Error(),
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "APPROVAL_FAILED",
				"message": err.Error(),
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User approved successfully",
	})
}

func handleRejectRemoveUser(c *gin.Context) {
	userId := c.Param("id")

	if userId == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": "User ID is required",
		})
		return
	}

	err := RejectRemoveUser(c.Request.Context(), userId)
	if err != nil {
		if err.Error() == "user not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "USER_NOT_FOUND",
				"message": err.Error(),
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "REMOVAL_FAILED",
				"message": err.Error(),
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User rejected/removed successfully",
	})
}
