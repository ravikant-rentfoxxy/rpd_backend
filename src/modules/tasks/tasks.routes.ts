import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { actorEventRank, canCreateOrgEvent, sameRegion, type EventViewer } from '../events/event.rank.js';

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
});

type TaskHost = Prisma.OrgTaskGetPayload<{ include: { host: { select: { id: true; fullName: true } } } }>;

export function serializeOrgTask(task: TaskHost) {
  return {
    id: task.id,
    title: task.title,
    detail: task.description ?? '',
    description: task.description ?? '',
    assignerName: task.host.fullName,
    assigner: { fullName: task.host.fullName },
    createdAt: task.createdAt.toISOString(),
    region: true,
  };
}

export function canSeeOrgTask(
  task: { hostId: string; stateId?: string | null; districtId?: string | null; assemblyId?: string | null },
  viewer: EventViewer,
) {
  if (viewer.isSuperAdmin) return true;
  if (task.hostId === viewer.id) return true;
  return sameRegion(task, viewer);
}

function visibleTaskWhere(member: EventViewer): Prisma.OrgTaskWhereInput {
  const base: Prisma.OrgTaskWhereInput = { deletedAt: null };
  if (member.isSuperAdmin) return base;
  const geo: Prisma.OrgTaskWhereInput[] = [];
  if (member.stateId) geo.push({ OR: [{ stateId: null }, { stateId: member.stateId }] });
  else geo.push({ stateId: null });
  if (member.districtId) geo.push({ OR: [{ districtId: null }, { districtId: member.districtId }] });
  else geo.push({ districtId: null });
  if (member.assemblyId) geo.push({ OR: [{ assemblyId: null }, { assemblyId: member.assemblyId }] });
  else geo.push({ assemblyId: null });
  return {
    ...base,
    OR: [{ hostId: member.id }, { AND: geo }],
  };
}

export async function listVisibleOrgTasks(member: EventViewer, take?: number) {
  const items = await prisma.orgTask.findMany({
    where: visibleTaskWhere(member),
    include: { host: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
    ...(take != null ? { take: Math.max(take * 4, 40) } : {}),
  });
  const visible = items.filter((task) => canSeeOrgTask(task, member)).map(serializeOrgTask);
  return take != null ? visible.slice(0, take) : visible;
}

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

  const [tasks, region] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: auth.member.id, status: { not: 'CANCELLED' } },
      include: { assigner: true },
      orderBy: { dueAt: 'asc' },
    }),
    listVisibleOrgTasks(auth.member),
  ]);

  const grouped = {
    region,
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
      region: region.length,
    },
    groups: grouped,
  });
});

tasksRouter.post('/', async (req, res) => {
  const auth = req as AuthedRequest;
  if (!canCreateOrgEvent(auth.member, auth.auth.post)) {
    throw forbidden('Only office bearers can create a task');
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid task');
  const hostPost = auth.member.isSuperAdmin ? 'SUPER_ADMIN' : auth.auth.post;
  const createdTask = await prisma.orgTask.create({
    data: {
      hostId: auth.member.id,
      hostPost,
      hostRank: actorEventRank(auth.member, auth.auth.post),
      title: parsed.data.title,
      description: parsed.data.description ?? '',
      stateId: auth.member.stateId,
      districtId: auth.member.districtId,
      assemblyId: auth.member.assemblyId,
    },
    include: { host: { select: { id: true, fullName: true } } },
  });
  return created(res, { task: serializeOrgTask(createdTask) });
});
