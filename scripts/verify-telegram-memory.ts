import { PrismaClient } from '@prisma/client';
import { loadRepoEnv } from '../packages/config/src/load-env.js';

interface CliOptions {
  help: boolean;
  internal: boolean;
  apiBaseUrl?: string;
  webhookSecret?: string;
  chatId?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  expectedName: string;
  unrelatedCount: number;
  delayMs: number;
  timeoutMs: number;
  requireDelivery: boolean;
}

interface BaselineState {
  conversationId: string | null;
  inboundCount: number;
  outboundCount: number;
  latestOutboundId: string | null;
  latestNameSummary: string | null;
}

interface RecallVerification {
  reply: string;
  replyMatches: boolean;
  retrievedCount: number;
  deliveryStatus: string;
  messageId: string;
}

interface PostResult {
  status: number;
  durationMs: number;
  body: unknown;
}

interface TurnInput {
  webhookUrl?: string;
  webhookSecret?: string;
  chatId: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  text: string;
  updateId: number;
  messageId: number;
  timeoutMs: number;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4000';
const DEFAULT_EXPECTED_NAME = 'Alice Johnson';
const DEFAULT_UNRELATED_COUNT = 20;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_TIMEOUT_MS = 90_000;

void main().catch((err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(`[memory-demo] Fatal error: ${error.message}`);
  process.exit(1);
});

async function main(): Promise<void> {
  loadRepoEnv();

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const apiBaseUrl = normalizeApiBaseUrl(
    options.apiBaseUrl
      ?? process.env['API_BASE_URL']
      ?? process.env['RENDER_EXTERNAL_URL']
      ?? DEFAULT_API_BASE_URL,
  );
  const webhookSecret = options.webhookSecret ?? process.env['TELEGRAM_WEBHOOK_SECRET'];

  if (!options.internal && !webhookSecret) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET is required. Pass --webhook-secret or configure it in .env.');
  }

  const syntheticChatId = buildSyntheticPrivateId();
  const chatId = options.chatId ?? syntheticChatId;
  const userId = options.userId ?? chatId;
  const usingSyntheticIds = !options.chatId && !options.userId;
  const firstName = options.firstName ?? 'Memory';
  const lastName = options.lastName ?? 'Demo';
  const username = options.username ?? `memory_demo_${String(userId).slice(-6)}`;

  const prisma = new PrismaClient();

  try {
    printRunHeader({
      apiBaseUrl,
      chatId,
      userId,
      expectedName: options.expectedName,
      unrelatedCount: options.unrelatedCount,
      usingSyntheticIds,
      requireDelivery: options.requireDelivery,
      internal: options.internal,
    });

    if (!options.internal) {
      await assertHealth(apiBaseUrl, options.timeoutMs);
    }

    const baseline = await loadBaselineState(prisma, chatId, userId);
    if (baseline.conversationId || baseline.latestNameSummary) {
      console.log('[memory-demo] Warning: existing conversation or name memory found for this chat/user.');
      console.log('[memory-demo] The script will verify message deltas, but a clean synthetic run is more reliable.');
    }

    const webhookUrl = !options.internal
      ? new URL('/webhooks/telegram', `${apiBaseUrl}/`).toString()
      : undefined;
    const seedText = `My name is ${options.expectedName}.`;
    const recallText = 'What name did I tell you earlier? Reply with just the name.';
    const turnDurations: number[] = [];
    const sendTurn = options.internal ? runInternalTurn : postTelegramTextUpdate;

    const counters = {
      updateId: buildCounterSeed(),
      messageId: 700_000,
    };

    console.log('[memory-demo] Sending seed fact...');
    const seedResult = await sendTurn({
      webhookUrl,
      webhookSecret,
      chatId,
      userId,
      firstName,
      lastName,
      username,
      text: seedText,
      updateId: counters.updateId++,
      messageId: counters.messageId++,
      timeoutMs: options.timeoutMs,
    });
    assertWebhookAccepted(seedResult, 'seed fact');
    turnDurations.push(seedResult.durationMs);

    const conversation = await waitForConversation(prisma, chatId, options.timeoutMs);
    const nameMemory = await waitForNameMemory(prisma, userId, options.expectedName, options.timeoutMs);

    console.log(`[memory-demo] Conversation: ${conversation.id}`);
    console.log(`[memory-demo] Stored memory: ${nameMemory.summary ?? '(no summary)'}`);

    for (let i = 1; i <= options.unrelatedCount; i++) {
      if (options.delayMs > 0) {
        await delay(options.delayMs);
      }

      const unrelatedResult = await sendTurn({
        webhookUrl,
        webhookSecret,
        chatId,
        userId,
        firstName,
        lastName,
        username,
        text: `ok ${i}`,
        updateId: counters.updateId++,
        messageId: counters.messageId++,
        timeoutMs: options.timeoutMs,
      });
      assertWebhookAccepted(unrelatedResult, `unrelated turn ${i}`);
      turnDurations.push(unrelatedResult.durationMs);

      if (i === 1 || i === options.unrelatedCount || i % 5 === 0) {
        console.log(`[memory-demo] Processed unrelated turn ${i}/${options.unrelatedCount}`);
      }
    }

    if (options.delayMs > 0) {
      await delay(options.delayMs);
    }

    console.log('[memory-demo] Sending recall question...');
    const recallResult = await sendTurn({
      webhookUrl,
      webhookSecret,
      chatId,
      userId,
      firstName,
      lastName,
      username,
      text: recallText,
      updateId: counters.updateId++,
      messageId: counters.messageId++,
      timeoutMs: options.timeoutMs,
    });
    assertWebhookAccepted(recallResult, 'recall question');
    turnDurations.push(recallResult.durationMs);

    const expectedTurns = options.unrelatedCount + 2;
    const verification = await waitForRecallVerification(
      prisma,
      conversation.id,
      baseline.outboundCount + expectedTurns,
      options.expectedName,
      options.timeoutMs,
    );
    const finalState = await loadFinalState(prisma, conversation.id);

    const inboundDelta = finalState.inboundCount - baseline.inboundCount;
    const outboundDelta = finalState.outboundCount - baseline.outboundCount;
    const memoryStored = summaryIncludesName(nameMemory.summary, options.expectedName);
    const retrievedMemory = verification.retrievedCount > 0;
    const deliveryOk = verification.deliveryStatus === 'sent';

    const pass =
      inboundDelta === expectedTurns
      && outboundDelta === expectedTurns
      && memoryStored
      && retrievedMemory
      && verification.replyMatches
      && (!options.requireDelivery || deliveryOk);

    console.log('');
    console.log(`Memory verdict: ${pass ? 'PASS' : 'FAIL'}`);
    console.log(`Conversation ID: ${conversation.id}`);
    console.log(`Inbound delta: ${inboundDelta}/${expectedTurns}`);
    console.log(`Outbound delta: ${outboundDelta}/${expectedTurns}`);
    console.log(`Stored memory: ${nameMemory.summary ?? '(none)'}`);
    console.log(`Recall reply: ${verification.reply}`);
    console.log(`Retrieved count: ${verification.retrievedCount}`);
    console.log(`Delivery status: ${verification.deliveryStatus}`);
    console.log(`Average turn latency: ${Math.round(average(turnDurations))} ms`);

    if (usingSyntheticIds && verification.deliveryStatus === 'failed') {
      console.log('[memory-demo] Note: failed delivery is expected with synthetic chat IDs.');
    }
    if (options.internal) {
      console.log('[memory-demo] Note: internal mode skips webhook ingress and Telegram delivery.');
    }

    if (!pass) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    internal: false,
    expectedName: DEFAULT_EXPECTED_NAME,
    unrelatedCount: DEFAULT_UNRELATED_COUNT,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    requireDelivery: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--internal':
        options.internal = true;
        break;
      case '--api-base-url':
        options.apiBaseUrl = readNextValue(argv, ++i, '--api-base-url');
        break;
      case '--webhook-secret':
        options.webhookSecret = readNextValue(argv, ++i, '--webhook-secret');
        break;
      case '--chat-id':
        options.chatId = readNumericId(argv, ++i, '--chat-id');
        break;
      case '--user-id':
        options.userId = readNumericId(argv, ++i, '--user-id');
        break;
      case '--first-name':
        options.firstName = readNextValue(argv, ++i, '--first-name');
        break;
      case '--last-name':
        options.lastName = readNextValue(argv, ++i, '--last-name');
        break;
      case '--username':
        options.username = readNextValue(argv, ++i, '--username');
        break;
      case '--name':
        options.expectedName = readNextValue(argv, ++i, '--name');
        break;
      case '--unrelated-count':
        options.unrelatedCount = readInteger(argv, ++i, '--unrelated-count', 20);
        break;
      case '--delay-ms':
        options.delayMs = readInteger(argv, ++i, '--delay-ms', 0);
        break;
      case '--timeout-ms':
        options.timeoutMs = readInteger(argv, ++i, '--timeout-ms', 1);
        break;
      case '--require-delivery':
        options.requireDelivery = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log('Usage: npm run demo:telegram-memory -- [options]');
  console.log('');
  console.log('Verifies STORY-T3 through the Telegram webhook path or the internal orchestration fallback.');
  console.log('');
  console.log('Options:');
  console.log('  --internal                Run executeEvent directly and skip webhook + Telegram delivery');
  console.log('  --api-base-url <url>      API server root URL. Default: API_BASE_URL or http://127.0.0.1:4000');
  console.log('  --webhook-secret <value>  Telegram webhook secret. Default: TELEGRAM_WEBHOOK_SECRET');
  console.log('  --name <value>            Expected remembered name. Default: Alice Johnson');
  console.log('  --unrelated-count <n>     Number of unrelated turns after the seed fact. Default: 20');
  console.log('  --delay-ms <n>            Delay between turns in milliseconds. Default: 0');
  console.log('  --timeout-ms <n>          HTTP/database timeout in milliseconds. Default: 90000');
  console.log('  --chat-id <id>            Optional real Telegram chat id for visible delivery');
  console.log('  --user-id <id>            Optional real Telegram user id');
  console.log('  --first-name <value>      Telegram sender first name override');
  console.log('  --last-name <value>       Telegram sender last name override');
  console.log('  --username <value>        Telegram sender username override');
  console.log('  --require-delivery        Fail if the final outbound message was not delivered to Telegram');
  console.log('');
  console.log('Notes:');
  console.log('  - --internal is the fastest local fallback when Telegram delivery is blocked or slow.');
  console.log('  - Without --chat-id/--user-id, the script uses synthetic ids for deterministic verification.');
  console.log('  - Synthetic mode can mark delivery as failed because Telegram cannot send to fake chats.');
  console.log('  - Real chat ids should only be used with a clean test chat because the script mutates live memory.');
}

function readNextValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function readNumericId(argv: string[], index: number, flag: string): string {
  const value = readNextValue(argv, index, flag);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`${flag} must be a safe integer.`);
  }
  return String(numeric);
}

function readInteger(argv: string[], index: number, flag: string, minimum: number): number {
  const raw = readNextValue(argv, index, flag);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${flag} must be an integer >= ${minimum}.`);
  }
  return value;
}

function normalizeApiBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function buildSyntheticPrivateId(): string {
  return String(Number(`9${Date.now().toString().slice(-10)}`));
}

function buildCounterSeed(): number {
  return Number(`${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`);
}

function printRunHeader(input: {
  apiBaseUrl: string;
  chatId: string;
  userId: string;
  expectedName: string;
  unrelatedCount: number;
  usingSyntheticIds: boolean;
  requireDelivery: boolean;
  internal: boolean;
}): void {
  console.log('[memory-demo] Starting Telegram memory verification');
  console.log(`[memory-demo] Mode: ${input.internal ? 'internal' : 'webhook'}`);
  if (!input.internal) {
    console.log(`[memory-demo] API base URL: ${input.apiBaseUrl}`);
  }
  console.log(`[memory-demo] Chat ID: ${input.chatId}`);
  console.log(`[memory-demo] User ID: ${input.userId}`);
  console.log(`[memory-demo] Expected name: ${input.expectedName}`);
  console.log(`[memory-demo] Unrelated turns: ${input.unrelatedCount}`);
  console.log(`[memory-demo] Delivery required: ${input.requireDelivery ? 'yes' : 'no'}`);
  if (input.usingSyntheticIds) {
    console.log('[memory-demo] Using synthetic ids for deterministic verification.');
  }
}

async function assertHealth(apiBaseUrl: string, timeoutMs: number): Promise<void> {
  const response = await fetchWithTimeout(new URL('/health', `${apiBaseUrl}/`).toString(), {
    method: 'GET',
    timeoutMs,
  });

  if (response.status !== 200) {
    throw new Error(`Health check failed with status ${response.status}.`);
  }
}

async function loadBaselineState(
  prisma: PrismaClient,
  chatId: string,
  userId: string,
): Promise<BaselineState> {
  const conversation = await prisma.conversation.findUnique({
    where: {
      channel_externalId: {
        channel: 'telegram',
        externalId: chatId,
      },
    },
    select: { id: true },
  });

  if (!conversation) {
    const latestName = await prisma.memoryRecord.findFirst({
      where: {
        namespace: `user:${userId}`,
        subjectKey: 'name',
      },
      orderBy: { updatedAt: 'desc' },
      select: { summary: true },
    });

    return {
      conversationId: null,
      inboundCount: 0,
      outboundCount: 0,
      latestOutboundId: null,
      latestNameSummary: latestName?.summary ?? null,
    };
  }

  const [inboundCount, outboundCount, latestOutbound, latestName] = await Promise.all([
    prisma.message.count({
      where: { conversationId: conversation.id, direction: 'inbound' },
    }),
    prisma.message.count({
      where: { conversationId: conversation.id, direction: 'outbound' },
    }),
    prisma.message.findFirst({
      where: { conversationId: conversation.id, direction: 'outbound' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
    prisma.memoryRecord.findFirst({
      where: {
        namespace: `user:${userId}`,
        subjectKey: 'name',
      },
      orderBy: { updatedAt: 'desc' },
      select: { summary: true },
    }),
  ]);

  return {
    conversationId: conversation.id,
    inboundCount,
    outboundCount,
    latestOutboundId: latestOutbound?.id ?? null,
    latestNameSummary: latestName?.summary ?? null,
  };
}

async function waitForConversation(
  prisma: PrismaClient,
  chatId: string,
  timeoutMs: number,
): Promise<{ id: string }> {
  return waitFor(
    async () => prisma.conversation.findUnique({
      where: {
        channel_externalId: {
          channel: 'telegram',
          externalId: chatId,
        },
      },
      select: { id: true },
    }),
    (value): value is { id: string } => Boolean(value?.id),
    timeoutMs,
    'conversation creation',
  );
}

async function waitForNameMemory(
  prisma: PrismaClient,
  userId: string,
  expectedName: string,
  timeoutMs: number,
): Promise<{ summary: string | null }> {
  return waitFor(
    async () => prisma.memoryRecord.findFirst({
      where: {
        namespace: `user:${userId}`,
        subjectKey: 'name',
      },
      orderBy: { updatedAt: 'desc' },
      select: { summary: true },
    }),
    (value): value is { summary: string | null } =>
      Boolean(value && summaryIncludesName(value.summary, expectedName)),
    timeoutMs,
    'name memory persistence',
  );
}

async function waitForRecallVerification(
  prisma: PrismaClient,
  conversationId: string,
  expectedOutboundCount: number,
  expectedName: string,
  timeoutMs: number,
): Promise<RecallVerification> {
  return waitFor(
    async () => {
      const [outboundCount, latestOutbound] = await Promise.all([
        prisma.message.count({
          where: { conversationId, direction: 'outbound' },
        }),
        prisma.message.findFirst({
          where: {
            conversationId,
            direction: 'outbound',
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            status: true,
            metadata: true,
          },
        }),
      ]);

      if (!latestOutbound) {
        return null;
      }

      if (outboundCount < expectedOutboundCount) {
        return null;
      }

      const metadata = asRecord(latestOutbound.metadata);
      const memoryMetadata = asRecord(metadata['memory']);
      const retrievedCount = readMetadataNumber(memoryMetadata['retrievedCount']);

      return {
        reply: latestOutbound.content,
        replyMatches: normalizeText(latestOutbound.content).includes(normalizeText(expectedName)),
        retrievedCount,
        deliveryStatus: latestOutbound.status,
        messageId: latestOutbound.id,
      };
    },
    (value): value is RecallVerification => Boolean(value && value.messageId),
    timeoutMs,
    'recall reply persistence',
  );
}

async function loadFinalState(
  prisma: PrismaClient,
  conversationId: string,
): Promise<{ inboundCount: number; outboundCount: number }> {
  const [inboundCount, outboundCount] = await Promise.all([
    prisma.message.count({
      where: { conversationId, direction: 'inbound' },
    }),
    prisma.message.count({
      where: { conversationId, direction: 'outbound' },
    }),
  ]);

  return { inboundCount, outboundCount };
}

async function postTelegramTextUpdate(input: {
  webhookUrl?: string;
  webhookSecret?: string;
  chatId: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  text: string;
  updateId: number;
  messageId: number;
  timeoutMs: number;
}): Promise<PostResult> {
  if (!input.webhookUrl || !input.webhookSecret) {
    throw new Error('Webhook mode requires webhookUrl and webhookSecret.');
  }

  const payload = {
    update_id: input.updateId,
    message: {
      message_id: input.messageId,
      from: {
        id: Number(input.userId),
        is_bot: false,
        first_name: input.firstName,
        last_name: input.lastName,
        username: input.username,
        language_code: 'en',
      },
      chat: {
        id: Number(input.chatId),
        type: 'private',
        first_name: input.firstName,
        last_name: input.lastName,
        username: input.username,
      },
      date: Math.floor(Date.now() / 1000),
      text: input.text,
    },
  };

  return fetchWithTimeout(input.webhookUrl, {
    method: 'POST',
    timeoutMs: input.timeoutMs,
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': input.webhookSecret,
    },
    body: JSON.stringify(payload),
  });
}

function assertWebhookAccepted(result: PostResult, label: string): void {
  if (result.status !== 200) {
    throw new Error(`Webhook call for ${label} failed with status ${result.status}.`);
  }

  const body = asRecord(result.body);
  if (body['ok'] !== true) {
    throw new Error(`Webhook call for ${label} did not return { ok: true }.`);
  }
}

async function fetchWithTimeout(
  url: string,
  input: {
    method: 'GET' | 'POST';
    timeoutMs: number;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      status: response.status,
      durationMs: Date.now() - startedAt,
      body: tryParseJson(text),
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new Error(`Request to ${url} failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function runInternalTurn(input: TurnInput): Promise<PostResult> {
  const startedAt = Date.now();
  process.env['NODE_ENV'] = 'production';
  const { executeEvent } = await import('../apps/api/src/orchestration/index.js');

  const event = {
    channel: 'telegram' as const,
    externalUserId: input.userId,
    externalUserName: buildDisplayName(input.firstName, input.lastName, input.username),
    externalThreadId: input.chatId,
    text: input.text,
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: {
      telegramUpdateId: input.updateId,
      telegramMessageId: input.messageId,
      telegramChatType: 'private',
      telegramUserId: Number(input.userId),
      telegramUsername: input.username,
      telegramLanguageCode: 'en',
    },
  };

  const result = await executeEvent(event);
  return {
    status: 200,
    durationMs: Date.now() - startedAt,
    body: {
      ok: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
      warnings: result.warnings,
    },
  };
}

async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const startedAt = Date.now();
  let lastValue: T | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await producer();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

function tryParseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readMetadataNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summaryIncludesName(summary: string | null, expectedName: string): boolean {
  return normalizeText(summary ?? '').includes(normalizeText(expectedName));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDisplayName(firstName: string, lastName: string, username: string): string {
  if (lastName) {
    return `${firstName} ${lastName}`;
  }

  if (username) {
    return `${firstName} (@${username})`;
  }

  return firstName;
}
