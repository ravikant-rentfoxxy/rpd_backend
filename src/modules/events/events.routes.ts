import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ActivityType, Prisma } from '@prisma/client';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl, putMemberPhoto } from '../../lib/storage.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { haversineMetres, isInIndia, toNumber } from '../../lib/geo.js';
import { geocodeAddress } from '../../lib/geocode.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { photoUpload } from '../../middleware/upload.js';
import { actorEventRank, canCreateOrgEvent, canSeeOrgEvent, type EventViewer } from './event.rank.js';
import { notifyEventCreated } from '../../lib/push.js';

const EVENT_TYPES = ['MEETING', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING'] as const;
const CHECK_IN_RADIUS_METRES = 500;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 24 * 60;
const DEFAULT_DURATION_MINUTES = 120;
/** How long ended events stay in the host's "Your events" list. */
const HOSTED_ENDED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

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
  const viewerJoin = event.joins.find((row) => row.memberId === viewerId);
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description ?? '',
    when: formatWhen(event.startsAt),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    durationMinutes: Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000),
    place: event.venue,
    venue: event.venue,
    latitude: event.latitude == null ? null : toNumber(event.latitude),
    longitude: event.longitude == null ? null : toNumber(event.longitude),
    imageUrl: event.imageUrl ? mediaPublicUrl(event.imageUrl) : null,
    joining: event.joins.length,
    checkedInCount: event.joins.filter((row) => row.checkedInAt != null).length,
    joined: viewerJoin != null,
    checkedIn: viewerJoin?.checkedInAt != null,
    checkedInAt: viewerJoin?.checkedInAt?.toISOString() ?? null,
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
  const base: Prisma.OrgEventWhereInput = { deletedAt: null, startsAt: { gt: new Date() } };
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
  // Older app builds don't send a duration; treat those events as 2 hours long.
  durationMinutes: z.coerce
    .number()
    .int()
    .min(MIN_DURATION_MINUTES, `Duration must be at least ${MIN_DURATION_MINUTES} minutes`)
    .max(MAX_DURATION_MINUTES, 'Duration cannot be more than 24 hours')
    .default(DEFAULT_DURATION_MINUTES),
  venue: z.string().trim().min(2).max(200),
  imageUrl: z.string().trim().url().max(512).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const checkInSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

function formatClock(date: Date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const events = await listVisibleEvents(auth.member, auth.auth.post);
  return ok(res, { events });
});

eventsRouter.get('/joined', async (req, res) => {
  const auth = req as AuthedRequest;
  const items = await prisma.orgEvent.findMany({
    where: {
      deletedAt: null,
      endsAt: { gt: new Date() },
      joins: { some: { memberId: auth.member.id } },
    },
    include: eventInclude,
    orderBy: { startsAt: 'asc' },
  });
  return ok(res, { events: items.map((event) => serializeOrgEvent(event, auth.member.id)) });
});

eventsRouter.get('/hosted', async (req, res) => {
  const auth = req as AuthedRequest;
  const items = await prisma.orgEvent.findMany({
    where: {
      hostId: auth.member.id,
      deletedAt: null,
      endsAt: { gt: new Date(Date.now() - HOSTED_ENDED_VISIBLE_MS) },
    },
    include: eventInclude,
    orderBy: { startsAt: 'desc' },
  });
  return ok(res, { events: items.map((event) => serializeOrgEvent(event, auth.member.id)) });
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
  if (body.latitude != null && body.longitude != null && !isInIndia(body.latitude, body.longitude)) {
    throw badRequest('The event location is outside India. Verify the address again.');
  }
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
      endsAt: new Date(body.startsAt.getTime() + body.durationMinutes * 60_000),
      venue: body.venue,
      latitude: body.latitude != null && body.longitude != null ? body.latitude : null,
      longitude: body.latitude != null && body.longitude != null ? body.longitude : null,
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
  notifyEventCreated({
    hostId: auth.member.id,
    eventId: event.id,
    type: event.type,
    startsAt: event.startsAt,
    venue: event.venue,
    stateId: event.stateId,
    districtId: event.districtId,
    assemblyId: event.assemblyId,
    hostRank: event.hostRank,
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

eventsRouter.post('/:id/check-in', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Share your location to check in');
  if (!isInIndia(parsed.data.latitude, parsed.data.longitude)) {
    throw badRequest('Your location could not be read correctly. Turn on GPS and try again.');
  }
  const event = await prisma.orgEvent.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: eventInclude,
  });
  if (!event) throw notFound('Event not found');
  const join = event.joins.find((row) => row.memberId === auth.member.id);
  if (!join) throw forbidden('Join this event before checking in');
  if (join.checkedInAt) {
    return ok(res, { event: serializeOrgEvent(event, auth.member.id), alreadyIn: true, metres: join.checkInMetres });
  }
  // Check-in is open only while the event runs: not before it starts, not after it ends.
  const now = Date.now();
  if (now < event.startsAt.getTime()) {
    throw badRequest(`This event has not started yet. Check in after ${formatClock(event.startsAt)}.`);
  }
  if (now > event.endsAt.getTime()) {
    throw badRequest(`This event ended at ${formatClock(event.endsAt)}.`);
  }

  let venueLat = event.latitude == null ? null : toNumber(event.latitude);
  let venueLng = event.longitude == null ? null : toNumber(event.longitude);
  if (venueLat == null || venueLng == null || !isInIndia(venueLat, venueLng)) {
    // Older events and ones created without a verified place: resolve the venue once and keep it.
    const hit = await geocodeAddress(event.venue).catch(() => null);
    if (!hit) throw badRequest('The location of this event could not be found');
    venueLat = hit.latitude;
    venueLng = hit.longitude;
    await prisma.orgEvent.update({
      where: { id: event.id },
      data: { latitude: venueLat, longitude: venueLng },
    });
  }

  const metres = haversineMetres(parsed.data.latitude, parsed.data.longitude, venueLat, venueLng);
  if (metres > CHECK_IN_RADIUS_METRES) {
    throw badRequest(
      `You are ${formatDistance(metres)} away from the venue. Move within ${CHECK_IN_RADIUS_METRES} m to check in.`,
    );
  }

  await prisma.orgEventJoin.update({
    where: { id: join.id },
    data: {
      checkedInAt: new Date(),
      checkInLatitude: parsed.data.latitude,
      checkInLongitude: parsed.data.longitude,
      checkInMetres: metres,
    },
  });
  const fresh = await prisma.orgEvent.findFirstOrThrow({
    where: { id: event.id },
    include: eventInclude,
  });
  return ok(res, { event: serializeOrgEvent(fresh, auth.member.id), alreadyIn: false, metres });
});
