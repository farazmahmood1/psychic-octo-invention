import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@nexclaw/shared';

export function notFoundHandler(req: Request, res: Response) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
