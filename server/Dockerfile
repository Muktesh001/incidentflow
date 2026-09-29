# IncidentFlow API — slim Node 20 Alpine image (~150MB)
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=5000

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# Copy source
COPY . .

# Non-root user for runtime security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 5000

# Health check against our /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:5000/health || exit 1

CMD ["node", "src/index.js"]
