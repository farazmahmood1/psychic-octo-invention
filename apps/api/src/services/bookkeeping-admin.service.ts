import type { BookkeepingExtractionSummary, BookkeepingListQuery } from '@openclaw/shared';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export async function listExtractions(query: BookkeepingListQuery) {
  const where: Prisma.ReceiptExtractionWhereInput = {
    ...(query.status ? { status: query.status as any } : {}),
    ...(query.category ? { category: query.category } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.receiptExtraction.findMany({
      where,
      include: { ledgerExport: { select: { status: true } } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.receiptExtraction.count({ where }),
  ]);

  const data: BookkeepingExtractionSummary[] = rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    category: r.category,
    status: r.status,
    confidence: r.confidence,
    extractedData: r.extractedData as Record<string, unknown> | null,
    sourceChannel: r.sourceChannel,
    errorDetails: r.errorDetails,
    exportStatus: r.ledgerExport?.status ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { data, total };
}
