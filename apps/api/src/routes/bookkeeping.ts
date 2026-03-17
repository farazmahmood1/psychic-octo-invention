import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { bookkeepingListQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listExtractions } from '../services/bookkeeping-admin.service.js';
import { toCsv } from '../utils/csv-export.js';

export const bookkeepingRouter = Router();

// GET /bookkeeping — list receipt extractions
bookkeepingRouter.get(
  '/',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(bookkeepingListQuerySchema, req.query);
      const { data, total } = await listExtractions(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

// GET /bookkeeping/export — CSV export of bookkeeping records
bookkeepingRouter.get(
  '/export',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(bookkeepingListQuerySchema, req.query);
      const { data } = await listExtractions({ ...query, page: 1, pageSize: 5000 });
      const rows = data.map((row) => {
        const d = row.extractedData ?? {};
        return {
          id: row.id,
          fileName: row.fileName ?? '',
          category: row.category ?? '',
          vendor: d['vendor'] != null ? String(d['vendor']) : '',
          amount: d['amount'] != null ? String(d['amount']) : '',
          currency: d['currency'] != null ? String(d['currency']) : 'USD',
          transactionDate: d['transactionDate'] != null ? String(d['transactionDate']) : '',
          status: row.status,
          exportStatus: row.exportStatus ?? '',
          confidence: row.confidence != null ? String(row.confidence) : '',
          channel: row.sourceChannel,
          createdAt: row.createdAt,
        };
      });
      const csv = toCsv(rows, [
        'id', 'fileName', 'category', 'vendor', 'amount', 'currency',
        'transactionDate', 'status', 'exportStatus', 'confidence', 'channel', 'createdAt',
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="bookkeeping.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);
