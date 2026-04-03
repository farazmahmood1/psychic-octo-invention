import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { API_PREFIX } from '@nexclaw/shared';
import { env } from '@nexclaw/config';
import { pinoHttp } from './middleware/pino-http.js';
import { requestId } from './middleware/request-id.js';
import { requestTimeout } from './middleware/request-timeout.js';
import { globalErrorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { sessionMiddleware, csrfMiddleware } from './middleware/auth/index.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { conversationsRouter } from './routes/conversations.js';
import { usageRouter } from './routes/usage.js';
import { skillsRouter } from './routes/skills.js';
import { auditRouter } from './routes/audit.js';
import { settingsRouter } from './routes/settings.js';
import { integrationsRouter } from './routes/integrations.js';
import { jobsRouter } from './routes/jobs.js';
import { memoryRouter } from './routes/memory.js';
import { bookkeepingRouter } from './routes/bookkeeping.js';
import { securityRouter } from './routes/security.js';
import { eventsRouter } from './routes/events.js';
import { webhooksRouter } from './routes/webhooks/index.js';

/** Global API rate limiter — 200 requests per minute per IP */
const globalRateLimit = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down.',
    },
  },
});

export function createApp() {
  const app = express();

  // Trust proxy (Render, Cloudflare) for correct client IP in rate limiting
  app.set('trust proxy', 1);

  // Disable X-Powered-By
  app.disable('x-powered-by');

  // ── Security middleware ──────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow cross-origin API calls
  }));

  app.use(
    cors({
      origin: [env.ADMIN_APP_URL, env.APP_BASE_URL].filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-request-id'],
      maxAge: 86400,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({
    limit: env.MAX_PAYLOAD_SIZE,
    verify: (req, _res, buf, encoding) => {
      const request = req as Request & { rawBody?: string };
      request.rawBody = buf.toString((encoding as BufferEncoding | undefined) ?? 'utf8');
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ── Request tracking ────────────────────────────────
  app.use(requestId);
  app.use(pinoHttp);
  app.use(requestTimeout);

  // ── Global rate limit ─────────────────────────────
  app.use(globalRateLimit);

  // ── Webhook routes (before session/CSRF — external callers) ──
  app.use('/webhooks', webhooksRouter);

  // ── Session loading (does not enforce auth) ─────────
  app.use(sessionMiddleware);

  // ── CSRF protection for state-changing requests ─────
  app.use(csrfMiddleware);

  // ── Routes ──────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/dashboard`, dashboardRouter);
  app.use(`${API_PREFIX}/conversations`, conversationsRouter);
  app.use(`${API_PREFIX}/usage`, usageRouter);
  app.use(`${API_PREFIX}/skills`, skillsRouter);
  app.use(`${API_PREFIX}/audit`, auditRouter);
  app.use(`${API_PREFIX}/settings`, settingsRouter);
  app.use(`${API_PREFIX}/integrations`, integrationsRouter);
  app.use(`${API_PREFIX}/jobs`, jobsRouter);
  app.use(`${API_PREFIX}/memory`, memoryRouter);
  app.use(`${API_PREFIX}/bookkeeping`, bookkeepingRouter);
  app.use(`${API_PREFIX}/security`, securityRouter);
  app.use(`${API_PREFIX}/events`, eventsRouter);

  // ── Serve admin frontend (single-service deployment) ──
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const adminDist = path.resolve(__dirname, '../../admin/dist');
  app.use(express.static(adminDist, { index: 'index.html' }));
  // SPA fallback: serve index.html for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(adminDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // ── Error handling ──────────────────────────────────
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
