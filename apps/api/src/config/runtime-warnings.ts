import { env, integrationConfigured, logger } from '@openclaw/config';

type ProcessType = 'api' | 'worker';

export function logRuntimeWarnings(processType: ProcessType): void {
  const summary = {
    redis: integrationConfigured.redis(),
    openrouter: integrationConfigured.openrouter(),
    telegram: integrationConfigured.telegram(),
    telegramWebhook: integrationConfigured.telegramWebhook(),
    emailSmtp: integrationConfigured.email(),
    emailWebhook: integrationConfigured.emailWebhook(),
    ghl: integrationConfigured.ghl(),
    googleSheets: integrationConfigured.googleSheets(),
  };

  logger.info(
    { processType, integrations: summary },
    'Runtime integration summary',
  );

  if (!summary.redis) {
    logger.warn(
      { processType },
      'REDIS_URL is not configured. Queue-backed durability and shared idempotency are disabled; fallback mode is active.',
    );
  } else if (processType === 'api') {
    logger.warn(
      'Redis is configured. Run a separate worker process for strongest queue reliability (`npm run start:worker`).',
    );
  }

  if (!summary.openrouter) {
    logger.warn('OPENROUTER_API_KEY is missing or placeholder. AI response and tool orchestration paths will fail.');
  }
  if (!summary.telegram) {
    logger.warn('TELEGRAM_BOT_TOKEN is missing or placeholder. Telegram integration is disabled.');
  } else if (!summary.telegramWebhook) {
    logger.warn(
      'TELEGRAM_WEBHOOK_SECRET is missing or placeholder. Telegram will use polling fallback outside production until webhook settings are completed.',
    );
  }
  if (!summary.emailSmtp) {
    logger.warn('SMTP credentials are incomplete. Outbound email replies are disabled.');
  }
  if (!summary.emailWebhook) {
    logger.warn(
      'Inbound email webhook is disabled. Configure INBOUND_EMAIL_WEBHOOK_SECRET for generic providers or RESEND_API_KEY plus RESEND_WEBHOOK_SECRET for Resend.',
    );
  }
  if (!summary.ghl) {
    logger.warn('GHL_API_TOKEN is missing or placeholder. GHL CRM sub-agent calls will fail.');
  }
  if (!summary.googleSheets) {
    logger.warn('Google Sheets integration is incomplete. Bookkeeping export-to-sheet will fail.');
  }

  if (env.SESSION_SECRET.toLowerCase().startsWith('change-me')) {
    logger.warn('SESSION_SECRET appears to be a placeholder. Replace it before any shared or production deployment.');
  }

  if (env.NODE_ENV === 'production' && env.APP_BASE_URL.includes('localhost')) {
    logger.warn('APP_BASE_URL still points to localhost in production mode.');
  }
  if (env.NODE_ENV === 'production' && env.ADMIN_APP_URL.includes('localhost')) {
    logger.warn('ADMIN_APP_URL still points to localhost in production mode.');
  }
}
