import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export function validate<T>(schema: ZodType<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[source]);
    if (source === 'query') {
      Object.assign(req.query, parsed as object);
    } else {
      req[source] = parsed as typeof req.body;
    }
    next();
  };
}
