import type { Response } from 'express';
import { logger } from '@openclaw/config';

export type SseEventType =
  | 'conversation:new'
  | 'conversation:message'
  | 'conversation:updated'
  | 'job:updated'
  | 'integration:health'
  | 'skill:updated'
  | 'usage:updated';

interface SseClient {
  id: string;
  res: Response;
  adminId: string;
}

class SseHub {
  private clients = new Map<string, SseClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Send heartbeat every 30 seconds to keep connections alive
    this.heartbeatTimer = setInterval(() => {
      this.broadcast(':heartbeat\n\n');
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  addClient(id: string, res: Response, adminId: string): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id })}\n\n`);

    this.clients.set(id, { id, res, adminId });
    logger.info({ clientId: id, adminId, totalClients: this.clients.size }, 'SSE client connected');

    // Cleanup on close
    res.on('close', () => {
      this.clients.delete(id);
      logger.info({ clientId: id, totalClients: this.clients.size }, 'SSE client disconnected');
    });
  }

  /** Send an event to all connected clients */
  emit(event: SseEventType, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.values()) {
      try {
        client.res.write(payload);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  /** Send raw text to all clients (for heartbeats) */
  private broadcast(text: string): void {
    for (const client of this.clients.values()) {
      try {
        client.res.write(text);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}

/** Singleton SSE hub shared across the application */
export const sseHub = new SseHub();
