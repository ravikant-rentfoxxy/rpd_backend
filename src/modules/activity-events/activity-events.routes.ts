import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const optionInclude = { orderBy: { sortOrder: 'asc' as const } };

const eventInclude = { options: optionInclude } satisfies Prisma.ActivityEventInclude;

function liveWhere(now = new Date()): Prisma.ActivityEventWhereInput {
  return {
    deletedAt: null,
    published: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
  };
}

async function serializeEvent(
  event: Prisma.ActivityEventGetPayload<{ include: typeof eventInclude }>,
  viewerId: string,
  optionId?: string | null,
) {
  const isCreator = event.createdById === viewerId;
  const grouped = await prisma.activityEventResponse.groupBy({
    by: ['optionId'],
    where: { eventId: event.id },
    _count: { optionId: true },
  });
  const total = grouped.reduce((sum, row) => sum + row._count.optionId, 0);
  const countBy = new Map(grouped.map((row) => [row.optionId, row._count.optionId]));
  return {
    id: event.id,
    createdById: event.createdById,
    title: event.title,
    description: event.description ?? '',
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    answered: Boolean(optionId),
    optionId: optionId ?? null,
    isCreator,
    ...(isCreator ? { responseCount: total } : {}),
    options: event.options.map((option) => ({
      id: option.id,
      label: option.label,
      percent: total === 0 ? 0 : Math.round(((countBy.get(option.id) ?? 0) * 100) / total),
    })),
  };
}

async function loadLiveEvent(id: string) {
  return prisma.activityEvent.findFirst({
    where: { id, ...liveWhere() },
    include: eventInclude,
  });
}

export async function findActiveActivityEvent(memberId: string) {
  const events = await prisma.activityEvent.findMany({
    where: liveWhere(),
    include: eventInclude,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (!events.length) return null;
  const answered = await prisma.activityEventResponse.findMany({
    where: { memberId, eventId: { in: events.map((row) => row.id) } },
    select: { eventId: true },
  });
  const done = new Set(answered.map((row) => row.eventId));
  const event = events.find((row) => !done.has(row.id));
  return event ? serializeEvent(event, memberId) : null;
}

export const activityEventsRouter = Router();
activityEventsRouter.use(requireAuth);

activityEventsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const events = await prisma.activityEvent.findMany({
    where: liveWhere(),
    include: eventInclude,
    orderBy: { createdAt: 'desc' },
  });
  const mine = await prisma.activityEventResponse.findMany({
    where: { memberId: auth.member.id, eventId: { in: events.map((row) => row.id) } },
    select: { eventId: true, optionId: true },
  });
  const byEvent = new Map(mine.map((row) => [row.eventId, row.optionId]));
  return ok(res, {
    events: await Promise.all(events.map((event) => serializeEvent(event, auth.member.id, byEvent.get(event.id)))),
  });
});

activityEventsRouter.get('/:id', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await loadLiveEvent(req.params.id);
  if (!event) throw notFound('Activity event not found');
  const mine = await prisma.activityEventResponse.findUnique({
    where: { eventId_memberId: { eventId: event.id, memberId: auth.member.id } },
    select: { optionId: true },
  });
  return ok(res, { event: await serializeEvent(event, auth.member.id, mine?.optionId) });
});

activityEventsRouter.post(
  '/:id/respond',
  validate(z.object({ optionId: z.string().uuid() })),
  async (req, res) => {
    const auth = req as unknown as AuthedRequest;
    const event = await loadLiveEvent(req.params.id);
    if (!event) throw notFound('Activity event not found');
    const optionId = (req.body as { optionId: string }).optionId;
    if (!event.options.some((option) => option.id === optionId)) {
      throw badRequest('Choose Yes or No');
    }
    const existing = await prisma.activityEventResponse.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId: auth.member.id } },
    });
    if (existing) throw forbidden('You already answered this event');
    await prisma.activityEventResponse.create({
      data: { eventId: event.id, memberId: auth.member.id, optionId },
    });
    return ok(res, { event: await serializeEvent(event, auth.member.id, optionId) });
  },
);
