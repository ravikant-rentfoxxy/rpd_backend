import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth, requirePost, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const rejectSchema = z.object({
  reason: z.string().min(4).max(600),
});

export const verificationRouter = Router();
verificationRouter.use(requireAuth);
verificationRouter.use(
  requirePost(
    'BOOTH_ADHYAKSH',
    'MANDAL_PRESIDENT',
    'ASSEMBLY_IN_CHARGE',
    'DISTRICT_SECRETARY',
    'DISTRICT_GENERAL_SECRETARY',
    'DISTRICT_PRESIDENT',
    'REGIONAL_PRESIDENT',
    'STATE_GENERAL_SECRETARY',
    'STATE_PRESIDENT',
    'NATIONAL_GENERAL_SECRETARY',
    'NATIONAL_PRESIDENT',
  ),
);

verificationRouter.get('/inbox', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const items = await prisma.activity.findMany({
    where: {
      status: { in: ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION'] },
      booth: auth.member.isSuperAdmin || !auth.member.mandalId ? undefined : { mandalId: auth.member.mandalId },
    },
    include: { actor: true, booth: true },
    orderBy: [{ reviewFlag: 'desc' }, { occurredAt: 'desc' }],
    take: 40,
  });
  return ok(res, { items });
});

verificationRouter.post('/:id/accept', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const activity = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!activity) throw notFound('Activity not found');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status: 'VERIFIED' },
  });
  await prisma.activityReview.create({
    data: { activityId: activity.id, reviewerId: auth.member.id, decision: 'VERIFIED' },
  });
  await prisma.pointLedgerEntry.updateMany({
    where: { activityId: activity.id, pending: true },
    data: { pending: false },
  });
  return ok(res, { activity: updated });
});

verificationRouter.post('/:id/reject', validate(rejectSchema), async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const { reason } = req.body as z.infer<typeof rejectSchema>;
  const activity = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!activity) throw notFound('Activity not found');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status: 'NOT_VERIFIED' },
  });
  await prisma.activityReview.create({
    data: { activityId: activity.id, reviewerId: auth.member.id, decision: 'NOT_VERIFIED', reason },
  });
  return ok(res, { activity: updated });
});
