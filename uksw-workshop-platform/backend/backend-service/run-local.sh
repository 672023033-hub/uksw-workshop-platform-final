#!/bin/bash
echo "========================================"
echo "Starting Backend Service Locally"
echo "========================================"
echo ""
echo "Server will run on: http://192.168.0.110:8080"
echo "Connecting to services on: 192.168.0.111"
echo "  - PostgreSQL: 192.168.0.111:5432"
echo "  - Redis: 192.168.0.111:6379"
echo "  - Kafka: 192.168.0.111:9092"
echo "  - Jaeger: 192.168.0.111:4318"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Run the Go application
go run .
