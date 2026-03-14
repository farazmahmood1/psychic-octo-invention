# Stage 1: Build
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

RUN npx prisma@5 generate --schema=prisma/schema.prisma && npm run build -w packages/shared && npm run build -w packages/config && npm run build -w apps/api && cd apps/admin && npx vite build

# Stage 2: API production base
FROM node:20-slim AS api-base
WORKDIR /app

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

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

# Stage 3: Worker process
FROM api-base AS worker
CMD ["node", "apps/api/dist/worker.js"]

# Stage 4: Database migration runner
FROM api-base AS migrate
USER root
RUN npm install -g prisma@5
USER appuser
CMD ["npx", "prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"]

# Stage 5: Admin static build (nginx)
FROM nginx:alpine AS admin
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  add_header X-Frame-Options "DENY" always;\n  add_header X-Content-Type-Options "nosniff" always;\n  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n  location /assets/ {\n    expires 1y;\n    add_header Cache-Control "public, immutable";\n  }\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80

# Stage 6: API server (DEFAULT - must be last for Render)
FROM api-base AS api
COPY --from=builder /app/apps/admin/dist apps/admin/dist/
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
