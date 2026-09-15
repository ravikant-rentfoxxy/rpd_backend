import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { haversineMetres, toNumber } from '../../lib/geo.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { notifyActivityRecorded } from '../../lib/push.js';

const createSchema = z.object({
  clientUuid: z.string().uuid(),
  type: z.enum(['MEETING', 'ADD_MEMBER', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING', 'OTHER']),
  boothId: z.string().uuid().optional(),
  occurredAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  backdateReason: z.string().max(400).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  farAwayReason: z.string().max(400).optional(),
  homesCovered: z.number().int().min(0).optional(),
  attendeeIds: z.array(z.string().uuid()).default([]),
  attendeeNames: z.array(z.string().min(1)).default([]),
  photos: z
    .array(
      z.object({
        kind: z.string(),
        storageKey: z.string(),
        bytes: z.number().int().positive(),
        capturedAt: z.string().datetime(),
      }),
    )
    .default([]),
});

export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);

activitiesRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const items = await prisma.activity.findMany({
    where: { actorId: auth.member.id, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    include: { booth: true, reviews: { orderBy: { createdAt: 'desc' }, take: 1, include: { reviewer: true } } },
  });
  return ok(res, { activities: items });
});

activitiesRouter.get('/:id', async (req, res) => {
  const item = await prisma.activity.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      booth: true,
      attendees: true,
      photos: true,
      reviews: { orderBy: { createdAt: 'desc' }, include: { reviewer: true } },
    },
  });
  if (!item) throw notFound('Activity not found');
  return ok(res, { activity: item });
});

activitiesRouter.post('/', validate(createSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof createSchema>;

  const existing = await prisma.syncIdempotency.findUnique({ where: { clientUuid: body.clientUuid } });
  if (existing) return created(res, existing.response);

  const boothId = body.boothId ?? auth.member.boothId ?? undefined;
  const booth = boothId
    ? await prisma.booth.findFirst({ where: { id: boothId, deletedAt: null } })
    : null;
  if (boothId && !booth) throw notFound('Booth not found');

  const occurredAt = new Date(body.occurredAt);
  const hoursAgo = (Date.now() - occurredAt.getTime()) / 36e5;
  if (hoursAgo > 24 && !body.backdateReason) {
    throw badRequest('A reason is needed for past dates');
  }

  let distanceMetres: number | null = null;
  let reviewFlag = false;
  if (booth && body.latitude != null && body.longitude != null) {
    distanceMetres = haversineMetres(
      body.latitude,
      body.longitude,
      toNumber(booth.latitude),
      toNumber(booth.longitude),
    );
    if (distanceMetres > 2000) {
      if (!body.farAwayReason) throw badRequest('A reason is needed when more than 2 km from the booth');
      reviewFlag = true;
    }
  }

  const activity = await prisma.activity.create({
    data: {
      clientUuid: body.clientUuid,
      actorId: auth.member.id,
      boothId: booth?.id ?? null,
      type: body.type,
      status: 'QUEUED',
      occurredAt,
      notes: body.notes,
      backdateReason: body.backdateReason,
      latitude: body.latitude,
      longitude: body.longitude,
      distanceMetres,
      farAwayReason: body.farAwayReason,
      reviewFlag,
      homesCovered: body.homesCovered,
      attendeeCount: body.attendeeIds.length + body.attendeeNames.length,
      photoCount: body.photos.length,
      attendees: {
        create: [
          ...body.attendeeIds.map((memberId) => ({ memberId })),
          ...body.attendeeNames.map((freeName) => ({ freeName })),
        ],
      },
      photos: {
        create: body.photos.map((p) => ({
          kind: p.kind,
          storageKey: p.storageKey,
          bytes: p.bytes,
          capturedAt: new Date(p.capturedAt),
        })),
      },
    },
    include: { booth: true },
  });

  if (booth) {
    await prisma.booth.update({
      where: { id: booth.id },
      data: { lastActivityAt: occurredAt },
    });
  }

  const pendingPoints =
    body.type === 'MEETING' && activity.attendeeCount >= 10
      ? 25
      : body.type === 'GRIHA_SAMPARK'
        ? Math.floor((body.homesCovered ?? 0) / 10) * 15
        : 0;

  if (pendingPoints > 0) {
    await prisma.pointLedgerEntry.create({
      data: {
        memberId: auth.member.id,
        activityId: activity.id,
        source: body.type === 'MEETING' ? 'MEETING_HELD' : 'GRIHA_SAMPARK',
        direction: 'CREDIT',
        points: pendingPoints,
        pending: true,
        note: `${body.type} pending verification`,
        periodMonth: new Date(occurredAt.getFullYear(), occurredAt.getMonth(), 1),
      },
    });
  }

  const payload = {
    activity,
    queue: { status: 'waiting', pendingPoints },
  };
  await prisma.syncIdempotency.create({
    data: { clientUuid: body.clientUuid, route: 'POST /activities', response: payload },
  });
  notifyActivityRecorded({
    actorId: auth.member.id,
    activityId: activity.id,
    type: body.type,
    occurredAt,
    place: booth?.name ?? booth?.landmark ?? null,
    stateId: auth.member.stateId,
    districtId: auth.member.districtId,
    assemblyId: auth.member.assemblyId,
  });
  return created(res, payload);
});

activitiesRouter.post('/:id/appeal', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const activity = await prisma.activity.findFirst({
    where: { id: req.params.id, actorId: auth.member.id },
  });
  if (!activity) throw notFound('Activity not found');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status: 'APPEALED' },
  });
  return ok(res, { activity: updated });
});
