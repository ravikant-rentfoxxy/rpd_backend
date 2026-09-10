import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const createSchema = z.object({
  boothId: z.string().uuid(),
  title: z.string().min(2).max(200),
  agenda: z.string().min(2),
  startsAt: z.string().datetime(),
  venue: z.string().min(2).max(200),
  invitees: z.array(z.object({ memberId: z.string().uuid(), postLabel: z.string() })).default([]),
});

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

meetingsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const meetings = await prisma.meeting.findMany({
    where: { OR: [{ hostId: auth.member.id }, { boothId: auth.member.boothId ?? undefined }] },
    include: { invitees: true, checkIns: true, booth: true },
    orderBy: { startsAt: 'desc' },
    take: 20,
  });
  return ok(res, { meetings });
});

meetingsRouter.get('/:id', async (req, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { invitees: true, checkIns: { include: { member: true } }, booth: true, host: true },
  });
  if (!meeting) throw notFound('Meeting not found');
  return ok(res, { meeting });
});

meetingsRouter.post('/', validate(createSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof createSchema>;
  const meeting = await prisma.meeting.create({
    data: {
      boothId: body.boothId,
      hostId: auth.member.id,
      title: body.title,
      agenda: body.agenda,
      startsAt: new Date(body.startsAt),
      venue: body.venue,
      invitees: { create: body.invitees },
    },
    include: { invitees: true, booth: true },
  });
  return created(res, { meeting });
});

meetingsRouter.post('/:id/start', async (req, res) => {
  const meeting = await prisma.meeting.update({
    where: { id: req.params.id },
    data: { status: 'IN_PROGRESS' },
  });
  return ok(res, { meeting });
});

meetingsRouter.post('/:id/check-in', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const body = z.object({ memberId: z.string().uuid().optional(), offline: z.boolean().default(false) }).parse(req.body);
  const memberId = body.memberId ?? auth.member.id;
  try {
    const checkIn = await prisma.meetingCheckIn.create({
      data: { meetingId: req.params.id, memberId, offline: body.offline },
      include: { member: true },
    });
    return created(res, { checkIn, alreadyIn: false });
  } catch {
    const existing = await prisma.meetingCheckIn.findUnique({
      where: { meetingId_memberId: { meetingId: req.params.id, memberId } },
      include: { member: true },
    });
    if (!existing) throw conflict('Could not check in');
    return ok(res, { checkIn: existing, alreadyIn: true });
  }
});
