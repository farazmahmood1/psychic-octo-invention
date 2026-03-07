import pinoHttpLib from 'pino-http';
import { logger } from '@openclaw/config';
import type { ServerResponse, IncomingMessage } from 'http';

/** Structured HTTP request logging with correlation IDs */
export const pinoHttp = pinoHttpLib.default({
  logger,
  genReqId: (req: IncomingMessage) => (req as IncomingMessage & { requestId: string }).requestId,
  customLogLevel(
    _req: IncomingMessage,
    res: ServerResponse,
    error: Error | undefined,
  ) {
    if (error || (res.statusCode && res.statusCode >= 500)) return 'error';
    if (res.statusCode && res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req: IncomingMessage, _res: ServerResponse, error: Error) {
    return `${req.method} ${req.url} failed: ${error.message}`;
  },
});
