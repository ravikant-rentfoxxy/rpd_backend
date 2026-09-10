import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}
