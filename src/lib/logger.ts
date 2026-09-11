import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logsDir = path.join(process.cwd(), 'logs');
mkdirSync(logsDir, { recursive: true });

export const logger = createLogger({
  level: 'error',
  defaultMeta: { service: 'rpd-api' },
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  transports: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '4d',
      level: 'error',
      zippedArchive: false,
    }),
  ],
});

export function logError(message: string, extra?: Record<string, unknown>) {
  logger.error(message, extra);
}
