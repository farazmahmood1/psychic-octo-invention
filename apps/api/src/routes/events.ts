import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { sseHub } from '../services/sse.service.js';

export const eventsRouter = Router();

/**
 * GET /events/stream — Server-Sent Events stream for real-time admin updates.
 * Requires authentication. Keeps connection open indefinitely.
 */
eventsRouter.get(
  '/stream',
  requireAuth,
  requireRole('viewer'),
  (req: Request, res: Response) => {
    const clientId = randomUUID();
    const adminId = (req as any).sessionUser?.id ?? 'unknown';

    // Disable request timeout for SSE
    req.setTimeout(0);
    res.setTimeout(0);

    sseHub.addClient(clientId, res, adminId);

    // When client disconnects, Express handles cleanup via res.on('close')
    req.on('close', () => {
      // handled by sseHub
    });
  },
);
