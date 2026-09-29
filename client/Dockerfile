# ── Stage 1: Build the React client with Vite ──────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx (alpine, ~25MB runtime) ─────────────────
FROM nginx:alpine AS runtime

# Copy our custom nginx config (SPA fallback, gzip, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static assets from the previous stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check: confirm index.html is 200 (useful in docker-compose + k8s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
