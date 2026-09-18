import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { ensureStorage } from './lib/storage.js';
import { logError } from './lib/logger.js';

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`${env.APP_NAME} listening on http://localhost:${env.PORT}`);
});

ensureStorage().catch((error: unknown) => {
  logError('Bunny Storage is not reachable. Check BUNNY_STORAGE_* env values.', {
    stack: error instanceof Error ? error.stack : undefined,
    detail: error instanceof Error ? error.message : String(error),
  });
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('uncaughtException', (error) => {
  logError(error.message || 'uncaughtException', { stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logError(error.message || 'unhandledRejection', { stack: error.stack });
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
