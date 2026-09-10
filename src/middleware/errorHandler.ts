import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Route not found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
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
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    ok: false,
    error: {
      code: 'internal',
      message: isProd ? 'Something went wrong' : err instanceof Error ? err.message : 'Unknown error',
    },
  });
}
