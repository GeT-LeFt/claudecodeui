# ---- Stage 1: Builder ----
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm rebuild && npm run build

# Rebuild production-only node_modules with native addons
RUN rm -rf node_modules && \
    npm ci --omit=dev --ignore-scripts && \
    npm rebuild && \
    node scripts/fix-node-pty.js

# ---- Stage 2: Production ----
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash --create-home appuser

WORKDIR /app

# Copy pre-built production node_modules (with native addons) from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built outputs from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/public ./public

RUN chown -R appuser:appuser /app

USER appuser

ENV NODE_ENV=production
ENV SERVER_PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist-server/server/index.js"]
