import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import type { AdminRequest } from './admin.auth.js';
import { engagementInclude, loadEngagement, serializeEngagementPlay } from '../engagement/engagement.shared.js';

const questionSchema = z.object({
  prompt: z.string().trim().min(2).max(400),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(200),
    isCorrect: z.boolean().optional(),
  })).min(2).max(8),
});

const createSchema = z.object({
  type: z.enum(['POLL', 'QUIZ']),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(2000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  published: z.boolean().optional(),
  questions: z.array(questionSchema).min(1).max(20),
});

function asAdmin(req: unknown) {
  return req as AdminRequest;
}

function assertSuperAdmin(req: unknown) {
  const auth = asAdmin(req);
  if (!auth.member.isSuperAdmin) throw forbidden('Only a super admin can manage engagement events');
  return auth;
}

function serializeAdminEvent(event: NonNullable<Awaited<ReturnType<typeof loadEngagement>>>) {
  return {
    ...serializeEngagementPlay(event, true),
    published: event.published,
    createdAt: event.createdAt.toISOString(),
  };
}

export const adminEngagementRouter = Router();

adminEngagementRouter.get('/', async (_req, res) => {
  const events = await prisma.engagementEvent.findMany({
    where: { deletedAt: null },
    include: engagementInclude,
    orderBy: { startsAt: 'desc' },
    take: 50,
  });
  return ok(res, { events: events.map(serializeAdminEvent) });
});

adminEngagementRouter.post('/', async (req, res) => {
  const auth = assertSuperAdmin(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid event');
  const body = parsed.data;
  if (body.endsAt.getTime() <= body.startsAt.getTime()) throw badRequest('End time must be after start time');
  if (body.type === 'QUIZ') {
    for (const question of body.questions) {
      if (question.options.filter((option) => option.isCorrect).length !== 1) {
        throw badRequest('Each quiz question needs exactly one correct option');
      }
    }
  }

  const event = await prisma.engagementEvent.create({
    data: {
      type: body.type,
      title: body.title,
      description: body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      published: body.published ?? true,
      createdById: auth.member.id,
      questions: {
        create: body.questions.map((question, index) => ({
          prompt: question.prompt,
          sortOrder: index,
          options: {
            create: question.options.map((option, optionIndex) => ({
              label: option.label,
              isCorrect: body.type === 'QUIZ' ? option.isCorrect === true : false,
              sortOrder: optionIndex,
            })),
          },
        })),
      },
    },
    include: engagementInclude,
  });
  return created(res, { event: serializeAdminEvent(event) });
});

adminEngagementRouter.patch('/:id', async (req, res) => {
  assertSuperAdmin(req);
  const event = await prisma.engagementEvent.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!event) throw notFound('Event not found');
  const published = req.body?.published;
  if (typeof published !== 'boolean') throw badRequest('published is required');
  const updated = await prisma.engagementEvent.update({
    where: { id: event.id },
    data: { published },
    include: engagementInclude,
  });
  return ok(res, { event: serializeAdminEvent(updated) });
});

adminEngagementRouter.delete('/:id', async (req, res) => {
  assertSuperAdmin(req);
  const event = await prisma.engagementEvent.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!event) throw notFound('Event not found');
  await prisma.engagementEvent.update({
    where: { id: event.id },
    data: { deletedAt: new Date(), published: false },
  });
  return ok(res, { deleted: true });
});
