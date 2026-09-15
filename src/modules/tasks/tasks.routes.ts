import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import {
  actorEventRank,
  canCreateOrgEvent,
  sameRegion,
  type EventViewer,
} from '../events/event.rank.js';

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
});

const taskInclude = {
  host: { select: { id: true, fullName: true } },
  starts: { select: { memberId: true, startedAt: true } },
} as const;

type TaskRow = Prisma.OrgTaskGetPayload<{ include: typeof taskInclude }>;

export function serializeOrgTask(task: TaskRow, viewer: EventViewer, viewerRank: number) {
  const mine = task.starts.find((row) => row.memberId === viewer.id);
  const isHost = task.hostId === viewer.id;
  return {
    id: task.id,
    title: task.title,
    detail: task.description ?? '',
    description: task.description ?? '',
    assignerName: task.host.fullName,
    assigner: { fullName: task.host.fullName },
    createdAt: task.createdAt.toISOString(),
    region: true,
    started: Boolean(mine),
    startedAt: mine?.startedAt.toISOString() ?? null,
    startedCount: isHost || viewer.isSuperAdmin ? task.starts.length : undefined,
    canStart: canStartOrgTask(task, viewer, viewerRank) && !mine,
  };
}

export function canSeeOrgTask(
  task: { hostId: string; hostRank: number; stateId?: string | null; districtId?: string | null; assemblyId?: string | null },
  viewer: EventViewer,
  viewerRank: number,
) {
  if (viewer.isSuperAdmin) return true;
  if (task.hostId === viewer.id) return true;
  return task.hostRank > viewerRank && sameRegion(task, viewer);
}

export function canStartOrgTask(
  task: { hostId: string; hostRank: number; stateId?: string | null; districtId?: string | null; assemblyId?: string | null },
  viewer: EventViewer,
  viewerRank: number,
) {
  if (viewer.isSuperAdmin) return false;
  if (task.hostId === viewer.id) return false;
  return task.hostRank > viewerRank && sameRegion(task, viewer);
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

export async function listVisibleOrgTasks(member: EventViewer, viewerPost?: string | null, take?: number) {
  const viewerRank = actorEventRank(member, viewerPost);
  const items = await prisma.orgTask.findMany({
    where: visibleTaskWhere(member),
    include: taskInclude,
    orderBy: { createdAt: 'desc' },
    ...(take != null ? { take: Math.max(take * 4, 40) } : {}),
  });
  const visible = items
    .filter((task) => canSeeOrgTask(task, member, viewerRank))
    .map((task) => serializeOrgTask(task, member, viewerRank));
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
    listVisibleOrgTasks(auth.member, auth.auth.post),
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

tasksRouter.post('/:id/start', async (req, res) => {
  const auth = req as AuthedRequest;
  const viewerRank = actorEventRank(auth.member, auth.auth.post);
  const task = await prisma.orgTask.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: taskInclude,
  });
  if (!task) throw notFound('Task not found');
  if (!canStartOrgTask(task, auth.member, viewerRank)) {
    throw forbidden('Only a lower member in this region can start this task');
  }
  await prisma.orgTaskStart.upsert({
    where: { taskId_memberId: { taskId: task.id, memberId: auth.member.id } },
    create: { taskId: task.id, memberId: auth.member.id },
    update: {},
  });
  const updated = await prisma.orgTask.findFirstOrThrow({
    where: { id: task.id },
    include: taskInclude,
  });
  return ok(res, { task: serializeOrgTask(updated, auth.member, viewerRank) });
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
    include: taskInclude,
  });
  return created(res, { task: serializeOrgTask(createdTask, auth.member, actorEventRank(auth.member, auth.auth.post)) });
});
