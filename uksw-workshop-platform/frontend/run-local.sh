#!/bin/bash
echo "========================================"
echo "Starting Frontend Development Server"
echo "========================================"
echo ""
echo "Frontend will run on: http://192.168.0.110:5173"
echo "API endpoint: http://192.168.0.110:8080/api"
echo "WebSocket: ws://192.168.0.110:8080/ws"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
    echo "========================================"
    echo ""
fi

# Start Vite dev server with host binding
npm run dev -- --host 192.168.0.110
