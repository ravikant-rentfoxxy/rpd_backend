import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createLogger, format, transports } from 'winston';
import type Transport from 'winston-transport';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Error logs go to daily files in ./logs when the disk is writable (local, Render, a VM).
 * Serverless hosts such as Vercel have a read-only filesystem, so there they go to the
 * console, which the host's log viewer already collects.
 */
function errorTransport(): Transport {
  if (!process.env.VERCEL) {
    const logsDir = path.join(process.cwd(), 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
      return new DailyRotateFile({
        dirname: logsDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '4d',
        level: 'error',
        zippedArchive: false,
      });
    } catch {
      // Read-only or missing directory: fall through to console logging.
    }
  }
  return new transports.Console({ level: 'error' });
}

export const logger = createLogger({
  level: 'error',
  defaultMeta: { service: 'rpd-api' },
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  transports: [errorTransport()],
});

export function logError(message: string, extra?: Record<string, unknown>) {
  logger.error(message, extra);
}
