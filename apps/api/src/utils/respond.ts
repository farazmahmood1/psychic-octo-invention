import type { Response } from 'express';
import { HTTP_STATUS } from '@nexclaw/shared';
import type { PaginationMeta } from '@nexclaw/shared';

/** Send a success response with data */
export function sendData<T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void {
  res.status(status).json({ data });
}

/** Send a paginated response */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: { page: number; pageSize: number; total: number },
): void {
  const paginationMeta: PaginationMeta = {
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    totalPages: Math.ceil(meta.total / meta.pageSize),
  };
  res.status(HTTP_STATUS.OK).json({ data, meta: paginationMeta });
}
