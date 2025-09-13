##########
# Builder
##########
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifest and lockfile
COPY package.json package-lock.json ./

# Install full dependencies for build
RUN npm ci

# Copy source
COPY . .

RUN npm run build

# Prune to production dependencies for runtime image
RUN npm prune --omit=dev

##########
# Runtime
##########
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S anycrawl -u 1001

# Only copy necessary runtime files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER anycrawl

ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Health check (stdio server doesn't expose a port; keep a simple noop)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the MCP server via node directly (no pnpm needed)
CMD ["node", "dist/cli.js"]
