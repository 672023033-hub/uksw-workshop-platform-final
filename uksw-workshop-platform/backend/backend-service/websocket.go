package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// WebSocket client structure
type WSClient struct {
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
	once   sync.Once
}

// WebSocket hub to manage all connections
type WSHub struct {
	clients    map[string]*WSClient
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan *WSMessage
	mu         sync.RWMutex
}

type WSMessage struct {
	UserID  string                 `json:"-"`
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

var wsHub = &WSHub{
	clients:    make(map[string]*WSClient),
	register:   make(chan *WSClient),
	unregister: make(chan *WSClient),
	broadcast:  make(chan *WSMessage, 256),
}

// Start the WebSocket hub
func (h *WSHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// Close existing connection if any
			if existingClient, ok := h.clients[client.UserID]; ok {
				existingClient.once.Do(func() {
					close(existingClient.Send)
				})
				existingClient.Conn.Close()
			}
			h.clients[client.UserID] = client
			h.mu.Unlock()
			log.Printf("[WebSocket] Client registered: %s", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if existingClient, ok := h.clients[client.UserID]; ok && existingClient == client {
				delete(h.clients, client.UserID)
				client.once.Do(func() {
					close(client.Send)
				})
				log.Printf("[WebSocket] Client unregistered: %s", client.UserID)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			if message.UserID != "" {
				// Send to specific user
				if client, ok := h.clients[message.UserID]; ok {
					data, _ := json.Marshal(message)
					select {
					case client.Send <- data:
						log.Printf("[WebSocket] Sent %s to user %s", message.Type, message.UserID)
					default:
						// Client's send channel is full, close it
						log.Printf("[WebSocket] Send channel full for user %s, dropping", message.UserID)
						client.once.Do(func() {
							close(client.Send)
						})
						delete(h.clients, message.UserID)
					}
				} else {
					log.Printf("[WebSocket] Client not found for user %s (Type: %s)", message.UserID, message.Type)
				}
			} else {
				// Broadcast to all users
				data, _ := json.Marshal(message)
				log.Printf("[WebSocket] Broadcasting %s to all (%d clients)", message.Type, len(h.clients))
				for userID, client := range h.clients {
					select {
					case client.Send <- data:
					default:
						client.once.Do(func() {
							close(client.Send)
						})
						delete(h.clients, userID)
					}
				}
			}
			h.mu.Unlock()
		}
	}
}

// Send notification to specific user
func notifyUser(userID string, messageType string, payload map[string]interface{}) {
	wsHub.broadcast <- &WSMessage{
		UserID:  userID,
		Type:    messageType,
		Payload: payload,
	}
}

// Send broadcast notification to all users
func notifyAll(messageType string, payload map[string]interface{}) {
	wsHub.broadcast <- &WSMessage{
		Type:    messageType,
		Payload: payload,
	}
}

// Handle WebSocket connections
func handleWebSocket(c *gin.Context) {
	// Get user ID from token
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &WSClient{
		UserID: userID.(string),
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	wsHub.register <- client

	// Send initial welcome/connected message
	notifyUser(userID.(string), "WS_CONNECTED", map[string]interface{}{
		"message": "Connected to real-time update hub",
	})

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// Read messages from WebSocket (mainly for ping/pong)
func (c *WSClient) readPump() {
	defer func() {
		wsHub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}
	}
}

// Write messages to WebSocket
func (c *WSClient) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Start WebSocket hub on server startup
func startWebSocketHub() {
	go wsHub.run()
	log.Println("[WebSocket] Hub started")
}
