/**
 * Vitest global setup for API tests.
 * Mocks external dependencies and sets test environment variables.
 */
import { vi } from 'vitest';

// Set test environment variables before any module loads env
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/openclaw_test';
process.env['REDIS_URL'] = 'redis://localhost:6379/1';
process.env['SESSION_SECRET'] = 'test-session-secret-minimum-32-chars-long!!';
process.env['OPENROUTER_API_KEY'] = 'test-openrouter-key';
process.env['OPENROUTER_BASE_URL'] = 'https://openrouter.ai/api/v1';
process.env['TELEGRAM_BOT_TOKEN'] = 'test-telegram-bot-token';
process.env['TELEGRAM_WEBHOOK_SECRET'] = 'test-telegram-webhook-secret';
process.env['INBOUND_EMAIL_WEBHOOK_SECRET'] = 'test-email-webhook-secret';
process.env['SMTP_HOST'] = 'localhost';
process.env['SMTP_PORT'] = '587';
process.env['SMTP_USER'] = 'test@openclaw.dev';
process.env['SMTP_PASS'] = 'test-smtp-pass';
process.env['SMTP_FROM'] = 'noreply@openclaw.dev';
process.env['GHL_API_BASE_URL'] = 'https://rest.gohighlevel.com/v1';
process.env['GHL_API_TOKEN'] = 'test-ghl-token';
process.env['GOOGLE_SERVICE_ACCOUNT_JSON'] = '{"type":"service_account","project_id":"test"}';
process.env['GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID'] = 'test-sheet-id';
process.env['APP_BASE_URL'] = 'http://localhost:4000';
process.env['ADMIN_APP_URL'] = 'http://localhost:5173';
process.env['API_BASE_URL'] = 'http://localhost:4000';

// Mock Prisma client globally
vi.mock('../db/client.js', () => ({
  prisma: {
    admin: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    adminSession: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
    conversation: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    participant: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    message: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), update: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    usageLog: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    skill: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    skillVersion: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    skillVettingResult: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    integration: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    job: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    memoryRecord: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    receiptExtraction: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    ledgerExport: { findUnique: vi.fn(), create: vi.fn() },
    telegramChat: { upsert: vi.fn(), findFirst: vi.fn() },
    emailThread: { findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    emailMessage: { findFirst: vi.fn(), create: vi.fn() },
    ghlActionLog: { create: vi.fn() },
    subAgentTask: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    followUpRecommendation: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((fn: () => unknown) => fn()),
  },
}));

// Mock Redis client to prevent actual connections
vi.mock('../db/redis.js', () => ({
  getRedis: vi.fn(() => null),
  checkRedisHealth: vi.fn(() => Promise.resolve(true)),
  closeRedis: vi.fn(async () => {}),
}));

// Mock queues to prevent BullMQ initialization
vi.mock('../queues/index.js', () => ({
  getQueue: vi.fn(() => null),
  startWorkers: vi.fn(() => []),
  closeQueues: vi.fn(async () => {}),
}));

// Mock logger to suppress output during tests
vi.mock('@openclaw/config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@openclaw/config');
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      })),
    },
  };
});
