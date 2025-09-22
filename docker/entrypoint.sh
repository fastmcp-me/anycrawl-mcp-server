#!/bin/bash

# AnyCrawl MCP Server with Nginx Docker Entrypoint
# Integrated nginx proxy functionality

set -e

# Default values
ANYCRAWL_MODE=${ANYCRAWL_MODE:-"STDIO"}
ANYCRAWL_PORT=${ANYCRAWL_PORT:-3000}
ANYCRAWL_HOST=${ANYCRAWL_HOST:-"0.0.0.0"}
CLOUD_SERVICE=${CLOUD_SERVICE:-"false"}
ENABLE_NGINX=${ENABLE_NGINX:-"true"}

# Log configuration
echo "🚀 Starting AnyCrawl MCP Server with Nginx..."
echo "   Mode: $ANYCRAWL_MODE"
echo "   Port: $ANYCRAWL_PORT"
echo "   Host: $ANYCRAWL_HOST"
echo "   Cloud Service: $CLOUD_SERVICE"
echo "   Nginx Enabled: $ENABLE_NGINX"

# Validate required environment variables
if [ "$CLOUD_SERVICE" = "true" ]; then
    echo "✅ Running in cloud service mode"
    echo "   API keys will be extracted from request headers"
else
    echo "✅ Running in self-hosted mode"
    if [ -n "$ANYCRAWL_API_KEY" ]; then
        echo "   Using API key from environment"
    fi
    if [ -n "$ANYCRAWL_BASE_URL" ]; then
        echo "   Using base URL: $ANYCRAWL_BASE_URL"
    else
        echo "   Using default base URL: https://api.anycrawl.dev"
    fi
fi

# Wait for any dependencies (if needed)
if [ -n "$WAIT_FOR_HOST" ] && [ -n "$WAIT_FOR_PORT" ]; then
    echo "⏳ Waiting for $WAIT_FOR_HOST:$WAIT_FOR_PORT to be available..."
    while ! nc -z "$WAIT_FOR_HOST" "$WAIT_FOR_PORT"; do
        sleep 1
    done
    echo "✅ $WAIT_FOR_HOST:$WAIT_FOR_PORT is available"
fi

# Health check function
health_check() {
    local port=$1
    local max_attempts=30
    local attempt=1
    
    echo "🔍 Performing health check on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "✅ Health check passed on attempt $attempt"
            return 0
        fi
        
        echo "   Attempt $attempt/$max_attempts: Health check failed, retrying in 2 seconds..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ Health check failed after $max_attempts attempts"
    return 1
}

# Nginx functions
start_nginx() {
    if [ "$ENABLE_NGINX" = "true" ]; then
        echo "🌐 Starting Nginx proxy..."
        
        # Test nginx configuration
        nginx -t
        if [ $? -ne 0 ]; then
            echo "❌ Nginx configuration test failed"
            exit 1
        fi
        
        # Start nginx in background
        nginx -g "daemon off;" &
        NGINX_PID=$!
        
        # Wait for nginx to start
        sleep 2
        
        # Check if nginx is running
        if kill -0 $NGINX_PID 2>/dev/null; then
            echo "✅ Nginx proxy is running on port 80"
            echo "   Proxy endpoint: http://localhost/{API_KEY}/sse"
            echo "   Health check: http://localhost/health"
        else
            echo "❌ Failed to start Nginx proxy"
            exit 1
        fi
    fi
}

stop_nginx() {
    if [ "$ENABLE_NGINX" = "true" ] && [ -n "$NGINX_PID" ]; then
        echo "🛑 Stopping Nginx proxy..."
        kill $NGINX_PID 2>/dev/null || true
    fi
}

# Cleanup function
cleanup() {
    echo "🛑 Shutting down services..."
    stop_nginx
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start nginx if enabled
start_nginx

# Start the server based on mode
case "$ANYCRAWL_MODE" in
    "STDIO")
        echo "📡 Starting in STDIO mode (MCP protocol)"
        exec node dist/cli.js
        ;;
    "MCP_AND_SSE")
        echo "📡 Starting in cloud mode (MCP + SSE)"
        echo "🚀 Server supports both MCP protocol (STDIO) and SSE endpoints"
        echo "   MCP protocol: Available via STDIO"
        echo "   SSE endpoint: http://localhost:$ANYCRAWL_PORT/sse"
        
        if [ "$ENABLE_NGINX" = "true" ]; then
            echo "   Nginx proxy: http://localhost/{API_KEY}/sse"
        fi
        
        # Start MCP server in background
        node dist/cli.js &
        SERVER_PID=$!
        
        # Wait for server to start
        if health_check "$ANYCRAWL_PORT"; then
            echo "✅ Server is ready on port $ANYCRAWL_PORT"
            
            # Keep the script running and wait for signals
            while true; do
                sleep 1
                # Check if server is still running
                if ! kill -0 $SERVER_PID 2>/dev/null; then
                    echo "❌ MCP server stopped unexpectedly"
                    cleanup
                fi
            done
        else
            echo "❌ Failed to start server"
            cleanup
        fi
        ;;
    *)
        echo "❌ Unknown mode: $ANYCRAWL_MODE"
        echo "   Supported modes: STDIO, MCP_AND_SSE"
        exit 1
        ;;
esac
