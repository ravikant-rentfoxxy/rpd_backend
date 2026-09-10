import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';

export const consentsRouter = Router();

consentsRouter.get('/current', requireAuth, async (req, res) => {
  const locale = String(req.query.locale ?? 'HI');
  const docs = await prisma.consentDocument.findMany({
    where: { isCurrent: true, locale: locale === 'EN' ? 'EN' : locale === 'BHO' ? 'BHO' : 'HI' },
    orderBy: { kind: 'asc' },
  });
  return ok(res, { documents: docs });
});
