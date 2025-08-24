#!/bin/bash

# MemServLight Benchmark with Graph Generation
# This script runs redis-benchmark and generates performance graphs

set -e  # Exit on any error

echo "📊 MemServLight Performance Benchmark with Graphs"
echo "================================================="

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

# Check if gnuplot is available (for graph generation)
if ! command -v gnuplot &> /dev/null; then
    echo -e "${YELLOW}Warning: gnuplot not found. Installing via homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install gnuplot
    else
        echo -e "${RED}Error: Please install gnuplot manually${NC}"
        echo "On macOS: brew install gnuplot"
        echo "On Ubuntu: sudo apt-get install gnuplot"
        exit 1
    fi
fi

# Create results directory
mkdir -p benchmark-results
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="benchmark-results/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"

# Build the project first
echo -e "${BLUE}Building project...${NC}"
npm run build

echo -e "${BLUE}Starting MemServLight server...${NC}"

# Start the server in the background with memory/performance optimizations
NODE_OPTIONS="--max-old-space-size=4096" node dist/server.js &
SERVER_PID=$!

# Function to cleanup server on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping server...${NC}"
    # Clean up temp files
    rm -f /tmp/set_output.txt /tmp/get_output.txt
    # Kill server gracefully
    if kill -0 $SERVER_PID 2>/dev/null; then
        kill -TERM $SERVER_PID 2>/dev/null || true
        sleep 2
        if kill -0 $SERVER_PID 2>/dev/null; then
            kill -KILL $SERVER_PID 2>/dev/null || true
        fi
        wait $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Server stopped.${NC}"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Wait for server to start and verify it's responsive
echo -e "${BLUE}Waiting for server to start...${NC}"
sleep 3

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${RED}Error: Server failed to start${NC}"
    exit 1
fi

echo -e "${BLUE}Running benchmark tests with different client counts...${NC}"

# Test different numbers of concurrent clients
CLIENTS=(1 10 50 100 200 300 400 500 600 700 800)
OPERATIONS=10000

# CSV header
echo "clients,set_rps,get_rps,set_latency_p50,get_latency_p50,set_latency_p95,get_latency_p95,set_latency_max,get_latency_max" > "$RESULTS_DIR/benchmark_results.csv"

# Raise file-descriptor limit for this run
TARGET_NOFILE=65536
CUR_SOFT=$(ulimit -Sn || echo 256)
CUR_HARD=$(ulimit -Hn || echo 256)

if [ "$CUR_SOFT" -lt "$TARGET_NOFILE" ]; then
  ulimit -n "$TARGET_NOFILE" 2>/dev/null || {
    echo -e "${YELLOW}Warning:${NC} couldn't set ulimit -n $TARGET_NOFILE (soft=$CUR_SOFT hard=$CUR_HARD)."
    echo "Run: sudo launchctl limit maxfiles 65536 200000 ; then open a new terminal and rerun."
  }
fi

for clients in "${CLIENTS[@]}"; do
    echo -e "${BLUE}Testing with $clients concurrent clients...${NC}"

    # Run SET benchmark with timeout and connection limits
    echo "Running SET operations..."
    SET_OUTPUT=""

    if timeout 500 redis-benchmark -h 127.0.0.1 -p 6379 -t set -n $OPERATIONS -c $clients -k 1 2>&1 > /tmp/set_output.txt; then
        SET_OUTPUT=$(cat /tmp/set_output.txt)
    else
        echo -e "${RED}SET benchmark timed out or failed for $clients clients${NC}"
        echo "$clients,TIMEOUT,TIMEOUT,TIMEOUT,TIMEOUT,TIMEOUT,TIMEOUT,TIMEOUT,TIMEOUT" >> "$RESULTS_DIR/benchmark_results.csv"
        continue
    fi

    # Parse SET results with fallback
    SET_RPS=$(echo "$SET_OUTPUT" | grep -E "requests per second" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    SET_P50=$(echo "$SET_OUTPUT" | grep -E "50\.000% <=" | grep -oE '<= [0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' | head -1)

    # Parse P95 and max from latency summary line (avg min p50 p95 p99 max)
    SET_LATENCY_LINE=$(echo "$SET_OUTPUT" | grep -A2 "latency summary" | tail -1)
    SET_P95=$(echo "$SET_LATENCY_LINE" | grep -oE '[0-9]+\.[0-9]+' | sed -n '4p')
    SET_MAX=$(echo "$SET_LATENCY_LINE" | grep -oE '[0-9]+\.[0-9]+' | sed -n '6p')

    # If parsing failed, try alternative patterns
    if [[ -z "$SET_RPS" ]]; then
        SET_RPS=$(echo "$SET_OUTPUT" | grep -oE '[0-9]+\.[0-9]+ requests per second' | grep -oE '[0-9]+\.[0-9]+')
    fi

    # Run GET benchmark with timeout
    echo "Running GET operations..."
    GET_OUTPUT=""
    if timeout 120 redis-benchmark -h 127.0.0.1 -p 6379 -t get -n $OPERATIONS -c $clients -k 1 2>&1 > /tmp/get_output.txt; then
        GET_OUTPUT=$(cat /tmp/get_output.txt)
    else
        echo -e "${RED}GET benchmark timed out or failed for $clients clients${NC}"
        echo "$clients,$SET_RPS,TIMEOUT,$SET_P50,TIMEOUT,$SET_P95,TIMEOUT,$SET_MAX,TIMEOUT" >> "$RESULTS_DIR/benchmark_results.csv"
        continue
    fi

    # Parse GET results with fallback
    GET_RPS=$(echo "$GET_OUTPUT" | grep -E "requests per second" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    GET_P50=$(echo "$GET_OUTPUT" | grep -E "50\.000% <=" | grep -oE '<= [0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' | head -1)

    # Parse P95 and max from latency summary line (avg min p50 p95 p99 max)
    GET_LATENCY_LINE=$(echo "$GET_OUTPUT" | grep -A2 "latency summary" | tail -1)
    GET_P95=$(echo "$GET_LATENCY_LINE" | grep -oE '[0-9]+\.[0-9]+' | sed -n '4p')
    GET_MAX=$(echo "$GET_LATENCY_LINE" | grep -oE '[0-9]+\.[0-9]+' | sed -n '6p')

    # If parsing failed, try alternative patterns
    if [[ -z "$GET_RPS" ]]; then
        GET_RPS=$(echo "$GET_OUTPUT" | grep -oE '[0-9]+\.[0-9]+ requests per second' | grep -oE '[0-9]+\.[0-9]+')
    fi

    # Use defaults if parsing still failed
    SET_RPS=${SET_RPS:-"0"}
    GET_RPS=${GET_RPS:-"0"}
    SET_P50=${SET_P50:-"0"}
    GET_P50=${GET_P50:-"0"}
    SET_P95=${SET_P95:-"0"}
    GET_P95=${GET_P95:-"0"}
    SET_MAX=${SET_MAX:-"0"}
    GET_MAX=${GET_MAX:-"0"}

    # Save to CSV
    echo "$clients,$SET_RPS,$GET_RPS,$SET_P50,$GET_P50,$SET_P95,$GET_P95,$SET_MAX,$GET_MAX" >> "$RESULTS_DIR/benchmark_results.csv"

    echo "  SET: $SET_RPS ops/sec (P50: ${SET_P50}ms, P95: ${SET_P95}ms, Max: ${SET_MAX}ms)"
    echo "  GET: $GET_RPS ops/sec (P50: ${GET_P50}ms, P95: ${GET_P95}ms, Max: ${GET_MAX}ms)"

    # Brief pause between tests to let server recover
    sleep 3
done

echo -e "${GREEN}Benchmark completed!${NC}"
echo -e "${BLUE}Generating graphs...${NC}"

# Generate gnuplot script for throughput
cat > "$RESULTS_DIR/throughput.gnuplot" << 'EOF'
set terminal png size 1024,768
set output 'throughput_comparison.png'
set title 'MemServLight Throughput vs Concurrent Clients'
set xlabel 'Concurrent Clients'
set ylabel 'Operations per Second'
set grid
set key outside right top
set datafile separator ','
set logscale x 2
plot 'benchmark_results.csv' using 1:2 with linespoints linewidth 2 pointtype 7 title 'SET Operations', \
     'benchmark_results.csv' using 1:3 with linespoints linewidth 2 pointtype 9 title 'GET Operations'
EOF

# Generate gnuplot script for latency
cat > "$RESULTS_DIR/latency.gnuplot" << 'EOF'
set terminal png size 1200,900
set output 'latency_comparison.png'
set title 'MemServLight Latency vs Concurrent Clients'
set xlabel 'Concurrent Clients'
set ylabel 'Latency (ms)'
set grid
set key outside right top
set datafile separator ','
set logscale x 2
plot 'benchmark_results.csv' using 1:4 with linespoints linewidth 2 pointtype 7 title 'SET P50 Latency', \
     'benchmark_results.csv' using 1:5 with linespoints linewidth 2 pointtype 9 title 'GET P50 Latency', \
     'benchmark_results.csv' using 1:6 with linespoints linewidth 2 pointtype 5 title 'SET P95 Latency', \
     'benchmark_results.csv' using 1:7 with linespoints linewidth 2 pointtype 11 title 'GET P95 Latency', \
     'benchmark_results.csv' using 1:8 with linespoints linewidth 1 pointtype 3 title 'SET Max Latency', \
     'benchmark_results.csv' using 1:9 with linespoints linewidth 1 pointtype 13 title 'GET Max Latency'
EOF

# Generate the graphs
cd "$RESULTS_DIR"
gnuplot throughput.gnuplot
gnuplot latency.gnuplot

echo -e "${GREEN}✅ Benchmark and graph generation completed!${NC}"
echo ""
echo -e "${GREEN}📊 Results saved to: $RESULTS_DIR${NC}"
echo "  - benchmark_results.csv: Raw data"
echo "  - throughput_comparison.png: Throughput graph"
echo "  - latency_comparison.png: Latency graph"
echo ""
echo "Opening graphs..."

# Open the generated images (macOS)
if command -v open &> /dev/null; then
    open throughput_comparison.png
    open latency_comparison.png
elif command -v xdg-open &> /dev/null; then
    xdg-open throughput_comparison.png
    xdg-open latency_comparison.png
fi
