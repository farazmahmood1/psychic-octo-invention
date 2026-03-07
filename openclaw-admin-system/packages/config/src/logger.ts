import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';
const isTest = process.env['NODE_ENV'] === 'test';

export const logger = pino({
  level: isTest ? 'silent' : isDev ? 'debug' : 'info',
  transport: isDev && !isTest
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // Redact secrets from log output
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'password',
      'passwordHash',
      'token',
      'sessionToken',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
  // OpenTelemetry-friendly: trace/span IDs are injected via request middleware
  mixin() {
    return { service: 'openclaw-api' };
  },
  // Serializers for safe logging
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export type Logger = typeof logger;
