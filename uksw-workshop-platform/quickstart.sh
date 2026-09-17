#!/bin/bash
# SIA.Sat Quick Start Script
# Starts the application in development mode

set -e

echo "========================================="
echo "SIA.Sat - Quick Start"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker."
    exit 1
fi

echo "[INFO] Starting services..."
docker compose up -d --build

echo ""
echo "Services starting..."
echo "Frontend:  http://192.168.0.111"
echo "Backend:   http://192.168.0.111:8080"
echo "Jaeger UI: http://192.168.0.111:8888"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
echo "========================================="
