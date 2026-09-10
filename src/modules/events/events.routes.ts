import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ActivityType, Prisma } from '@prisma/client';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl, putMemberPhoto } from '../../lib/storage.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { photoUpload } from '../../middleware/upload.js';
import { actorEventRank, canCreateOrgEvent, canSeeOrgEvent, type EventViewer } from './event.rank.js';

const EVENT_TYPES = ['MEETING', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING'] as const;

const eventInclude = {
  host: { select: { id: true, fullName: true, photoUrl: true } },
  joins: {
    orderBy: { createdAt: 'asc' as const },
    include: { member: { select: { id: true, fullName: true, photoUrl: true } } },
  },
};

type EventRow = Prisma.OrgEventGetPayload<{ include: typeof eventInclude }>;

function formatWhen(startsAt: Date) {
  return startsAt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(',', ' ·');
}

export function serializeOrgEvent(event: EventRow, viewerId: string) {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description ?? '',
    when: formatWhen(event.startsAt),
    startsAt: event.startsAt.toISOString(),
    place: event.venue,
    venue: event.venue,
    imageUrl: event.imageUrl ? mediaPublicUrl(event.imageUrl) : null,
    joining: event.joins.length,
    joined: event.joins.some((row) => row.memberId === viewerId),
    hostId: event.hostId,
    hostName: event.host.fullName,
    createdAt: event.createdAt.toISOString(),
    hostPost: event.hostPost,
    joiners: event.joins.slice(0, 30).map((row) => ({
      id: row.member.id,
      fullName: row.member.fullName,
      photoUrl: row.member.photoUrl,
    })),
  };
}

export function visibleEventWhere(member: EventViewer, rank: number): Prisma.OrgEventWhereInput {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const base: Prisma.OrgEventWhereInput = { deletedAt: null, startsAt: { gte: start } };
  if (member.isSuperAdmin) return base;
  const geo: Prisma.OrgEventWhereInput[] = [];
  if (member.stateId) geo.push({ OR: [{ stateId: null }, { stateId: member.stateId }] });
  else geo.push({ stateId: null });
  if (member.districtId) geo.push({ OR: [{ districtId: null }, { districtId: member.districtId }] });
  else geo.push({ districtId: null });
  if (member.assemblyId) geo.push({ OR: [{ assemblyId: null }, { assemblyId: member.assemblyId }] });
  else geo.push({ assemblyId: null });
  return {
    ...base,
    OR: [{ hostId: member.id }, { AND: [{ hostRank: { gt: rank } }, ...geo] }],
  };
}

export async function listVisibleEvents(member: EventViewer, post: string | null | undefined, take?: number) {
  const rank = actorEventRank(member, post);
  const items = await prisma.orgEvent.findMany({
    where: visibleEventWhere(member, rank),
    include: eventInclude,
    orderBy: { createdAt: 'desc' },
    ...(take != null ? { take: Math.max(take * 4, 40) } : {}),
  });
  const visible = items.filter((event) => canSeeOrgEvent(event, member, rank)).map((event) => serializeOrgEvent(event, member.id));
  return take != null ? visible.slice(0, take) : visible;
}

const createSchema = z.object({
  type: z.enum(EVENT_TYPES),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.coerce.date(),
  venue: z.string().trim().min(2).max(200),
  imageUrl: z.string().trim().url().max(512).optional(),
});

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const events = await listVisibleEvents(auth.member, auth.auth.post);
  return ok(res, { events });
});

eventsRouter.get('/:id', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await prisma.orgEvent.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: eventInclude,
  });
  if (!event) throw notFound('Event not found');
  const rank = actorEventRank(auth.member, auth.auth.post);
  if (!canSeeOrgEvent(event, auth.member, rank)) throw forbidden('This event is not in your region');
  return ok(res, { event: serializeOrgEvent(event, auth.member.id) });
});

eventsRouter.post('/', photoUpload.single('file'), async (req, res) => {
  const auth = req as AuthedRequest;
  if (!canCreateOrgEvent(auth.member, auth.auth.post)) {
    throw forbidden('Only office bearers can create this activity');
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid event');
  const body = parsed.data;
  if (body.startsAt.getTime() < Date.now() - 60_000) throw badRequest('Pick a future date and time');
  const file = req.file;
  let imageUrl = body.imageUrl;
  if (file) {
    const key = `events/${auth.member.id}/${randomUUID()}.jpg`;
    await putMemberPhoto(key, file.buffer, file.mimetype || 'image/jpeg');
    imageUrl = key;
  }
  const hostPost = auth.member.isSuperAdmin ? 'SUPER_ADMIN' : auth.auth.post;
  const createdEvent = await prisma.orgEvent.create({
    data: {
      hostId: auth.member.id,
      hostPost,
      hostRank: actorEventRank(auth.member, auth.auth.post),
      type: body.type as ActivityType,
      title: body.title,
      description: body.description ?? '',
      startsAt: body.startsAt,
      venue: body.venue,
      imageUrl,
      stateId: auth.member.stateId,
      districtId: auth.member.districtId,
      assemblyId: auth.member.assemblyId,
    },
  });
  const event = await prisma.orgEvent.findFirstOrThrow({
    where: { id: createdEvent.id },
    include: eventInclude,
  });
  return created(res, { event: serializeOrgEvent(event, auth.member.id) });
});

eventsRouter.post('/:id/join', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await prisma.orgEvent.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: eventInclude,
  });
  if (!event) throw notFound('Event not found');
  const rank = actorEventRank(auth.member, auth.auth.post);
  if (!canSeeOrgEvent(event, auth.member, rank)) throw forbidden('This event is not in your region');
  try {
    await prisma.orgEventJoin.create({
      data: { eventId: event.id, memberId: auth.member.id },
    });
  } catch {
    // already joined
  }
  const fresh = await prisma.orgEvent.findFirstOrThrow({
    where: { id: event.id },
    include: eventInclude,
  });
  return ok(res, { event: serializeOrgEvent(fresh, auth.member.id) });
});
