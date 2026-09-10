import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

  const tasks = await prisma.task.findMany({
    where: { assigneeId: auth.member.id, status: { not: 'CANCELLED' } },
    include: { assigner: true },
    orderBy: { dueAt: 'asc' },
  });

  const grouped = {
    overdue: [] as typeof tasks,
    today: [] as typeof tasks,
    thisWeek: [] as typeof tasks,
    later: [] as typeof tasks,
  };

  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    if (task.dueAt < startOfToday || task.status === 'OVERDUE') grouped.overdue.push(task);
    else if (task.dueAt < endOfToday) grouped.today.push(task);
    else if (task.dueAt < endOfWeek) grouped.thisWeek.push(task);
    else grouped.later.push(task);
  }

  return ok(res, {
    counts: {
      overdue: grouped.overdue.length,
      today: grouped.today.length,
    },
    groups: grouped,
  });
});
