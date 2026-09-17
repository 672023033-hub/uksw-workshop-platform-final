#!/bin/bash
# SIA.Sat - Workshop Registration System
# Docker Deployment Script

set -e

# Determine host IP dynamically
if [ -z "$HOST_IP" ]; then
    HOST_IP=$(hostname -I | awk '{print $1}' 2>/dev/null | xargs || ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "192.168.0.151")
fi

echo "========================================"
echo "SIA.Sat - Workshop Registration System"
echo "Docker Deployment on $HOST_IP"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker."
    exit 1
fi

echo "[INFO] Docker is running..."
echo ""

# Stop and remove existing containers
echo "[STEP 1/4] Stopping existing containers..."
docker compose down -v
echo ""

# Start services (with build to ensure fresh images)
echo "[STEP 2/4] Starting services..."
docker compose up -d --build
echo ""

# Wait for services to be healthy
echo "[STEP 3/4] Waiting for services to be ready..."
sleep 10
echo ""

# Show status
echo "[STEP 4/4] Checking service status..."
docker compose ps
echo ""

echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Frontend:  http://$HOST_IP"
echo "Backend:   http://$HOST_IP:8080"
echo "Jaeger UI: http://$HOST_IP:8888"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
echo "========================================"
