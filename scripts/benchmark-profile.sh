#!/bin/bash

# MemServLight Performance Benchmarking and Profiling Script
# This script runs redis-benchmark against the server while profiling with Node.js CPU profiler

set -e  # Exit on any error

echo "🚀 MemServLight Performance Benchmark & Profiling"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if redis-benchmark is available
if ! command -v redis-benchmark &> /dev/null; then
    echo -e "${RED}Error: redis-benchmark not found. Please install Redis tools.${NC}"
    echo "On macOS: brew install redis"
    echo "On Ubuntu: sudo apt-get install redis-tools"
    exit 1
fi

# Check if speedscope is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx not found. Please install Node.js.${NC}"
    exit 1
fi

# Create profiles directory
mkdir -p profiles

# Build the project first
echo -e "${BLUE}Building project...${NC}"
npm run build

echo -e "${BLUE}Starting MemServLight server with CPU profiling...${NC}"

# Start the server with CPU profiling in the background
node \
  --cpu-prof \
  --cpu-prof-name=tcp.cpuprofile \
  --cpu-prof-dir=./profiles \
  --cpu-prof-interval=1000 \
  dist/server.js &

SERVER_PID=$!

# Function to cleanup server on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping server...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo -e "${GREEN}Server stopped.${NC}"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Wait for server to start
echo -e "${BLUE}Waiting for server to start...${NC}"
sleep 3

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${RED}Error: Server failed to start${NC}"
    exit 1
fi

# Run the benchmark
echo -e "${BLUE}Running Redis benchmark...${NC}"
echo "Target: 1,000,000 operations (SET and GET)"
echo "This may take a few minutes..."

redis-benchmark -h 127.0.0.1 -p 6379 -t set,get -n 1000000 -d 100 -q

echo -e "${GREEN}Benchmark completed!${NC}"

# Stop the server to finalize the CPU profile
echo -e "${BLUE}Stopping server to finalize CPU profile...${NC}"
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null || true

# Check if profile was created
if [ ! -f "./profiles/tcp.cpuprofile" ]; then
    echo -e "${RED}Error: CPU profile not found at ./profiles/tcp.cpuprofile${NC}"
    exit 1
fi

echo -e "${GREEN}CPU profile saved to ./profiles/tcp.cpuprofile${NC}"

# Open speedscope
echo -e "${BLUE}Opening speedscope for profile analysis...${NC}"
echo "Note: This will open speedscope in your default browser"

npx speedscope profiles/tcp.cpuprofile

echo -e "${GREEN}✅ Benchmarking and profiling completed successfully!${NC}"
echo ""
echo "📊 Analysis:"
echo "- Check the benchmark results above for performance metrics"
echo "- Use speedscope (opened in browser) to analyze CPU usage"
echo "- Profile file saved at: ./profiles/tcp.cpuprofile"
