#!/bin/bash
# Clean rebuild script - removes all images and rebuilds from scratch

set -e

echo "========================================"
echo "SIA.Sat - Clean Rebuild"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker."
    exit 1
fi

echo "[INFO] Stopping and removing all containers..."
docker compose down -v

echo ""
echo "[INFO] Removing old images..."
docker compose rm -f
docker rmi sia-backend sia-frontend 2>/dev/null || true

echo ""
echo "[INFO] Building fresh images..."
docker compose build --no-cache

echo ""
echo "[INFO] Starting services..."
docker compose up -d

echo ""
echo "[INFO] Waiting for services..."
sleep 10

echo ""
echo "[INFO] Checking status..."
docker compose ps

echo ""
echo "========================================"
echo "Clean Rebuild Complete!"
echo "========================================"
echo ""
echo "Frontend:  http://192.168.0.111"
echo "Backend:   http://192.168.0.111:8080"
echo "Jaeger UI: http://192.168.0.111:8888"
echo ""
