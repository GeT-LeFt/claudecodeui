# ---- Stage 1: Builder ----
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev --ignore-scripts && \
    node scripts/fix-node-pty.js

# Copy built outputs from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV SERVER_PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist-server/server/index.js"]
