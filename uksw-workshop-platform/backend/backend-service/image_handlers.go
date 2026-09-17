package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// handleUploadWorkshopImage handles uploading a preview image for a workshop.
// Route: POST /api/mentor/workshops/:id/image
// The :id is the workshop_session id (we resolve to the workshop id in this handler).
// Accepts multipart/form-data with field "image".
// Validates: jpeg, png, webp only; max 2MB.
// Stores as base64 data URI in workshops.preview_image.
func handleUploadWorkshopImage(c *gin.Context) {
	sessionId := c.Param("id")
	userId, _ := c.Get("userId")

	// Validate that the mentor owns this session
	var workshopId string
	err := db.QueryRowContext(c.Request.Context(), `
		SELECT ws.workshop_id
		FROM workshop_sessions ws
		JOIN mentors m ON ws.mentor_id = m.id
		JOIN users u ON m.user_id = u.id
		WHERE ws.id = $1 AND u.id = $2
	`, sessionId, userId.(string)).Scan(&workshopId)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "FORBIDDEN",
			"message": "Workshop not found or you do not own it",
		})
		return
	}

	// Parse the multipart form (max 2MB)
	const maxSize = 2 << 20 // 2MB
	if err := c.Request.ParseMultipartForm(maxSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_REQUEST",
			"message": "Failed to parse form. File may be too large (max 2MB).",
		})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "NO_FILE",
			"message": "No image file provided. Use field name 'image'.",
		})
		return
	}
	defer file.Close()

	// Check file size
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "FILE_TOO_LARGE",
			"message": "Image must be smaller than 2MB",
		})
		return
	}

	// Read first 512 bytes to detect MIME type
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])

	// Validate mime type
	allowedTypes := map[string]string{
		"image/jpeg": "jpeg",
		"image/png":  "png",
		"image/webp": "webp",
	}
	if _, ok := allowedTypes[mimeType]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_FILE_TYPE",
			"message": fmt.Sprintf("Only JPEG, PNG, and WEBP images are allowed. Got: %s", mimeType),
		})
		return
	}

	// Seek back to start and read the full file
	if seeker, ok := file.(io.Seeker); ok {
		seeker.Seek(0, io.SeekStart)
	} else {
		// If we can't seek, reconstruct from the buf + rest of file
		rest, _ := io.ReadAll(file)
		fullBytes := append(buf[:n], rest...)
		dataURI := buildDataURI(mimeType, fullBytes)
		if err := savePreviewImage(c, workshopId, dataURI); err != nil {
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"imageUrl": dataURI,
			"message":  "Workshop preview image updated successfully",
		})
		return
	}

	// Read all bytes
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "READ_ERROR",
			"message": "Failed to read image file",
		})
		return
	}

	// Build base64 data URI
	dataURI := buildDataURI(mimeType, fileBytes)

	// Store in DB
	if err := savePreviewImage(c, workshopId, dataURI); err != nil {
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"imageUrl": dataURI,
		"message":  "Workshop preview image updated successfully",
	})
}

// handleDeleteWorkshopImage removes the preview image for a workshop.
// Route: DELETE /api/mentor/workshops/:id/image
func handleDeleteWorkshopImage(c *gin.Context) {
	sessionId := c.Param("id")
	userId, _ := c.Get("userId")

	var workshopId string
	err := db.QueryRowContext(c.Request.Context(), `
		SELECT ws.workshop_id
		FROM workshop_sessions ws
		JOIN mentors m ON ws.mentor_id = m.id
		JOIN users u ON m.user_id = u.id
		WHERE ws.id = $1 AND u.id = $2
	`, sessionId, userId.(string)).Scan(&workshopId)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "FORBIDDEN",
			"message": "Workshop not found or you do not own it",
		})
		return
	}

	_, err = db.ExecContext(c.Request.Context(),
		`UPDATE workshops SET preview_image = NULL WHERE id = $1`,
		workshopId,
	)
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
		"message": "Workshop preview image removed",
	})
}

// buildDataURI creates a base64 data URI from raw bytes and MIME type.
func buildDataURI(mimeType string, data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded)
}

// savePreviewImage persists the data URI to the workshops table.
func savePreviewImage(c *gin.Context, workshopId, dataURI string) error {
	// Sanity check: reject obviously bad data URIs
	if !strings.HasPrefix(dataURI, "data:image/") {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "INVALID_IMAGE",
			"message": "Invalid image data",
		})
		return fmt.Errorf("invalid data URI")
	}

	_, err := db.ExecContext(c.Request.Context(),
		`UPDATE workshops SET preview_image = $1 WHERE id = $2`,
		dataURI, workshopId,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "SAVE_FAILED",
			"message": "Failed to save image to database: " + err.Error(),
		})
		return err
	}
	return nil
}
