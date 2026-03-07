import { BaseRepository } from '../db/repository.js';
import type { ChannelType, ReceiptStatus, Prisma } from '@prisma/client';

export class ReceiptExtractionRepository extends BaseRepository {
  async create(data: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel: ChannelType;
    sourceMessageId?: string;
    idempotencyKey?: string;
    fileName?: string;
    fileUrl?: string;
    fileType?: string;
  }) {
    return this.db.receiptExtraction.create({
      data: {
        conversationId: data.conversationId,
        externalUserId: data.externalUserId,
        sourceChannel: data.sourceChannel,
        sourceMessageId: data.sourceMessageId,
        idempotencyKey: data.idempotencyKey,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        status: 'pending',
      },
    });
  }

  async findById(id: string) {
    return this.db.receiptExtraction.findUnique({
      where: { id },
      include: { ledgerExport: true },
    });
  }

  async findByIdempotencyKey(key: string) {
    return this.db.receiptExtraction.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async findPendingByConversation(conversationId: string) {
    return this.db.receiptExtraction.findFirst({
      where: {
        conversationId,
        status: { in: ['pending', 'extracted'] },
        category: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateExtraction(
    id: string,
    data: {
      extractedData: Prisma.InputJsonValue;
      confidence: number;
      status: ReceiptStatus;
      errorDetails?: string;
    },
  ) {
    return this.db.receiptExtraction.update({
      where: { id },
      data: {
        extractedData: data.extractedData,
        confidence: data.confidence,
        status: data.status,
        errorDetails: data.errorDetails,
      },
    });
  }

  async setCategory(id: string, category: string) {
    return this.db.receiptExtraction.update({
      where: { id },
      data: { category },
    });
  }

  async updateStatus(id: string, status: ReceiptStatus, errorDetails?: string) {
    return this.db.receiptExtraction.update({
      where: { id },
      data: { status, errorDetails },
    });
  }

  async createLedgerExport(data: {
    receiptExtractionId: string;
    spreadsheetId: string;
    sheetName?: string;
    rowRange?: string;
    exportedData?: Prisma.InputJsonValue;
  }) {
    return this.db.ledgerExport.create({
      data: {
        receiptExtractionId: data.receiptExtractionId,
        spreadsheetId: data.spreadsheetId,
        sheetName: data.sheetName,
        rowRange: data.rowRange,
        exportedData: data.exportedData,
        status: 'exported',
        exportedAt: new Date(),
      },
    });
  }
}

export const receiptExtractionRepository = new ReceiptExtractionRepository();
