import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { isProd } from '../config/env.js';
import { logError } from '../lib/logger.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Route not found' } });
}

function requestMeta(req: Request) {
  return { method: req.method, path: req.originalUrl };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'validation_error',
        message: 'Check the fields and try again',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      ok: false,
      error: { code: 'validation_error', message: err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large' : 'Could not read the photo' },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logError(err.message, { ...requestMeta(req), code: err.code, stack: err.stack });
    }
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logError(err instanceof Error ? err.message : 'Unknown error', {
    ...requestMeta(req),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({
    ok: false,
    error: {
      code: 'internal',
      message: isProd ? 'Something went wrong' : err instanceof Error ? err.message : 'Unknown error',
    },
  });
}
