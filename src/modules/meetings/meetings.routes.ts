import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { haversineMetres, toNumber } from '../../lib/geo.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const CHECK_IN_RADIUS_METRES = 500;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const createSchema = z.object({
  boothId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(200),
  agenda: z.string().trim().min(2).max(2000).optional(),
  startsAt: z.string().datetime().optional(),
  venue: z.string().trim().min(2).max(200),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  invitees: z.array(z.object({ memberId: z.string().uuid(), postLabel: z.string() })).default([]),
});

const checkInSchema = z.object({
  memberId: z.string().uuid().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  offline: z.boolean().default(false),
});

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

function serializeMeeting(meeting: {
  id: string;
  code: string;
  boothId: string | null;
  hostId: string;
  title: string;
  agenda: string;
  startsAt: Date;
  venue: string;
  latitude: unknown;
  longitude: unknown;
  status: string;
  createdAt: Date;
  invitees?: unknown[];
  checkIns?: unknown[];
  booth?: unknown;
  host?: unknown;
}) {
  return {
    id: meeting.id,
    code: meeting.code,
    boothId: meeting.boothId,
    hostId: meeting.hostId,
    title: meeting.title,
    agenda: meeting.agenda,
    startsAt: meeting.startsAt.toISOString(),
    venue: meeting.venue,
    latitude: meeting.latitude == null ? null : toNumber(meeting.latitude),
    longitude: meeting.longitude == null ? null : toNumber(meeting.longitude),
    status: meeting.status,
    createdAt: meeting.createdAt.toISOString(),
    invitees: meeting.invitees ?? [],
    checkIns: meeting.checkIns ?? [],
    booth: meeting.booth ?? null,
    host: meeting.host ?? null,
  };
}

async function generateMeetingCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let code = 'MTG-';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_CHARS[randomInt(CODE_CHARS.length)];
    }
    const exists = await prisma.meeting.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw conflict('Could not create a meeting ID');
}

async function findMeeting(idOrCode: string) {
  const isUuid = z.string().uuid().safeParse(idOrCode).success;
  return prisma.meeting.findFirst({
    where: isUuid ? { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] } : { code: idOrCode.toUpperCase() },
    include: { invitees: true, checkIns: { include: { member: true } }, booth: true, host: true },
  });
}

meetingsRouter.get('/', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const meetings = await prisma.meeting.findMany({
    where: { OR: [{ hostId: auth.member.id }, { boothId: auth.member.boothId ?? undefined }] },
    include: { invitees: true, checkIns: true, booth: true, host: true },
    orderBy: { startsAt: 'desc' },
    take: 20,
  });
  return ok(res, { meetings: meetings.map(serializeMeeting) });
});

meetingsRouter.get('/:id', async (req, res) => {
  const meeting = await findMeeting(req.params.id);
  if (!meeting) throw notFound('Meeting not found');
  return ok(res, { meeting: serializeMeeting(meeting) });
});

meetingsRouter.post('/', validate(createSchema), async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const body = req.body as z.infer<typeof createSchema>;
  const boothId = body.boothId ?? auth.member.boothId ?? null;
  if (boothId) {
    const booth = await prisma.booth.findUnique({ where: { id: boothId }, select: { id: true } });
    if (!booth) throw badRequest('Booth not found');
  }
  const meeting = await prisma.meeting.create({
    data: {
      code: await generateMeetingCode(),
      boothId,
      hostId: auth.member.id,
      title: body.title,
      agenda: body.agenda ?? body.title,
      startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
      venue: body.venue,
      latitude: body.latitude,
      longitude: body.longitude,
      invitees: { create: body.invitees },
    },
    include: { invitees: true, checkIns: true, booth: true, host: true },
  });
  return created(res, { meeting: serializeMeeting(meeting) });
});

meetingsRouter.post('/:id/start', async (req, res) => {
  const found = await findMeeting(req.params.id);
  if (!found) throw notFound('Meeting not found');
  const meeting = await prisma.meeting.update({
    where: { id: found.id },
    data: { status: 'IN_PROGRESS' },
    include: { invitees: true, checkIns: true, booth: true, host: true },
  });
  return ok(res, { meeting: serializeMeeting(meeting) });
});

meetingsRouter.post('/:id/check-in', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Share your location to join this meeting');
  const meeting = await findMeeting(req.params.id);
  if (!meeting) throw notFound('Meeting not found');
  if (meeting.latitude == null || meeting.longitude == null) {
    throw badRequest('This meeting has no location');
  }
  const metres = haversineMetres(
    parsed.data.latitude,
    parsed.data.longitude,
    toNumber(meeting.latitude),
    toNumber(meeting.longitude),
  );
  if (metres > CHECK_IN_RADIUS_METRES) {
    throw badRequest(`You must be within ${CHECK_IN_RADIUS_METRES} metres of the meeting`);
  }
  const memberId = parsed.data.memberId ?? auth.member.id;
  try {
    const checkIn = await prisma.meetingCheckIn.create({
      data: { meetingId: meeting.id, memberId, offline: parsed.data.offline },
      include: { member: true },
    });
    return created(res, { checkIn, alreadyIn: false, metres });
  } catch {
    const existing = await prisma.meetingCheckIn.findUnique({
      where: { meetingId_memberId: { meetingId: meeting.id, memberId } },
      include: { member: true },
    });
    if (!existing) throw conflict('Could not check in');
    return ok(res, { checkIn: existing, alreadyIn: true, metres });
  }
});
