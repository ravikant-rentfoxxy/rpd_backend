import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

function serialize(row: {
  id: string;
  title: string;
  body: string;
  type: string;
  refId: string | null;
  seenAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    refId: row.refId,
    seen: row.seenAt != null,
    seenAt: row.seenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const [rows, unreadCount] = await Promise.all([
    prisma.memberNotification.findMany({
      where: { memberId: auth.member.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.memberNotification.count({
      where: { memberId: auth.member.id, seenAt: null },
    }),
  ]);
  return ok(res, {
    notifications: rows.map(serialize),
    unreadCount,
  });
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const auth = req as AuthedRequest;
  const unreadCount = await prisma.memberNotification.count({
    where: { memberId: auth.member.id, seenAt: null },
  });
  return ok(res, { unreadCount });
});

notificationsRouter.post('/seen-all', async (req, res) => {
  const auth = req as AuthedRequest;
  await prisma.memberNotification.updateMany({
    where: { memberId: auth.member.id, seenAt: null },
    data: { seenAt: new Date() },
  });
  return ok(res, { unreadCount: 0 });
});

notificationsRouter.patch('/:id/seen', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const id = z.string().uuid().parse(req.params.id);
  const row = await prisma.memberNotification.findFirst({
    where: { id, memberId: auth.member.id },
  });
  if (!row) throw notFound('Notification not found');
  const updated =
    row.seenAt != null
      ? row
      : await prisma.memberNotification.update({
          where: { id: row.id },
          data: { seenAt: new Date() },
        });
  const unreadCount = await prisma.memberNotification.count({
    where: { memberId: auth.member.id, seenAt: null },
  });
  return ok(res, { notification: serialize(updated), unreadCount });
});
