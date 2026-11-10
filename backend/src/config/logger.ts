import pino, { type LoggerOptions } from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

// ORM/provider messages can embed entire private payloads; log only diagnostic metadata.
const serializeError = (error: unknown) => {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return {
    type: error instanceof Error ? error.constructor.name : 'Error',
    code:
      typeof value.code === 'string' && /^(?:P\d{4}|E[A-Z_]{2,40})$/.test(value.code)
        ? value.code
        : undefined,
    status: Number.isInteger(value.status) ? value.status : undefined,
  };
};

/**
 * Logging is configured entirely through the environment, so the same image can
 * run in development, production, CI and tests without a rebuild.
 *
 *   LOG_LEVEL   trace | debug | info | warn | error | fatal | silent
 *   LOG_FORMAT  pretty | json   (default: pretty in development, json elsewhere)
 *
 * `json` emits one structured object per line — the shape log shippers (Loki,
 * Datadog, CloudWatch, ELK) expect. `pretty` is human-readable and meant for a
 * developer's terminal only; it is never the default in production because it is
 * slower and far harder to parse downstream.
 */
const nodeEnv = process.env.NODE_ENV ?? 'development';
// `VITEST` is checked too: a shell that exports NODE_ENV=production globally would
// otherwise make the suite dump production logs over the test report.
const isTest = nodeEnv === 'test' || process.env.VITEST === 'true';
const isProduction = nodeEnv === 'production' && !isTest;

const defaultFormat = isProduction || isTest ? 'json' : 'pretty';
const format = (process.env.LOG_FORMAT ?? defaultFormat).toLowerCase();

// Tests stay silent unless LOG_LEVEL is set explicitly, so a failing assertion is
// not buried under application noise.
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug');

export const loggerOptions: LoggerOptions = {
  level,
  mixin: () => ({ ...requestContext.getStore() }),
  serializers: { err: serializeError, reason: serializeError },
  // Anything that could carry a credential or personal data is replaced before it
  // reaches a transport. Redaction lives here so a careless `logger.info({ req })`
  // elsewhere cannot leak a token.
  redact: {
    paths: [
      'password',
      'newPassword',
      'currentPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'apiKey',
      'cookie',
      'body',
      'req.body',
      'req.url',
      'req.originalUrl',
      'req.query',
      'req.params',
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'headers["set-cookie"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  // Useful when several instances ship to one aggregator; noise on a laptop.
  base: isProduction ? { service: 'clarity-backend', env: nodeEnv } : undefined,
  formatters: {
    // Emit `"level":"info"` rather than `"level":30` — most backends key off the
    // label, and a human reading raw JSON should not need a lookup table.
    level: (label) => ({ level: label }),
  },
};

export const logger = pino(
  format === 'pretty'
    ? {
        ...loggerOptions,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : loggerOptions,
);

/** Child logger so each module can tag its output: `const log = createLogger('aiService')`. */
export const createLogger = (module: string) => logger.child({ module });
