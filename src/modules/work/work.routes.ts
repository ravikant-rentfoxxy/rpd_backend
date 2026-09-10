import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const workRouter = Router();
workRouter.use(requireAuth);

workRouter.get('/ledger', async (req, res) => {
  const auth = req as AuthedRequest;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const entries = await prisma.pointLedgerEntry.findMany({
    where: { memberId: auth.member.id, periodMonth: monthStart },
    orderBy: { createdAt: 'desc' },
  });
  const confirmed = entries
    .filter((e) => !e.pending)
    .reduce((s, e) => s + (e.direction === 'CREDIT' ? e.points : -e.points), 0);
  const pending = entries
    .filter((e) => e.pending && e.direction === 'CREDIT')
    .reduce((s, e) => s + e.points, 0);

  return ok(res, {
    month: monthStart,
    points: confirmed,
    pendingPoints: pending,
    mandalRank: 3,
    mandalSize: 14,
    boothRank: 1,
    boothSize: 6,
    entries,
  });
});
