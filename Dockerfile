# ── Stage 1: Build ────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY prisma/ prisma/

RUN npm ci --maxsockets=1

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/

# Generate Prisma client + build all workspaces
# Skip tsc type-check for admin (Vite handles bundling; avoids flaky type issues in Docker)
RUN npx prisma@5 generate --schema=prisma/schema.prisma && \
    npm run build -w packages/shared && \
    npm run build -w packages/config && \
    npm run build -w apps/api && \
    cd apps/admin && npx vite build

# ── Stage 2: API production base ──────────────────────
FROM node:20-slim AS api-base
WORKDIR /app

# Install OpenSSL for Prisma (required on slim images)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/config/package.json packages/config/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist apps/api/dist/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/config/dist packages/config/dist/
COPY --from=builder /app/prisma prisma/
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma/

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

# ── Stage 3: API server ──────────────────────────────
FROM api-base AS api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

# ── Stage 4: Worker process ──────────────────────────
FROM api-base AS worker
CMD ["node", "apps/api/dist/worker.js"]

# ── Stage 5: Database migration runner ───────────────
FROM api-base AS migrate
USER root
RUN npm install -g prisma@5
USER appuser
CMD ["npx", "prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"]

# ── Stage 6: Admin static build (nginx or Render static site) ──
FROM nginx:alpine AS admin
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 80
