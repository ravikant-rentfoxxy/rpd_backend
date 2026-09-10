import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { findActiveEngagement, loadEngagement, liveEventWhere, serializeEngagementPlay, serializeEngagementPrompt } from './engagement.shared.js';

const submitSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    optionId: z.string().uuid(),
  })).min(1),
});

export const engagementRouter = Router();
engagementRouter.use(requireAuth);

engagementRouter.get('/active', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await findActiveEngagement(auth.member.id);
  return ok(res, { engagement: event ? serializeEngagementPrompt(event) : null });
});

engagementRouter.get('/:id', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await loadEngagement(req.params.id);
  if (!event || !event.published) throw notFound('Event not found');
  const now = new Date();
  if (event.startsAt > now || event.endsAt < now) throw forbidden('This event is not live');
  const entry = await prisma.engagementEntry.findUnique({
    where: { eventId_memberId: { eventId: event.id, memberId: auth.member.id } },
    include: { answers: true },
  });
  const done = Boolean(entry?.completedAt);
  return ok(res, {
    event: serializeEngagementPlay(event, done && event.type === 'QUIZ'),
    completed: done,
    dismissed: Boolean(entry?.dismissedAt),
    answers: done ? entry?.answers.map((row) => ({ questionId: row.questionId, optionId: row.optionId })) ?? [] : [],
  });
});

engagementRouter.post('/:id/dismiss', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await prisma.engagementEvent.findFirst({ where: { id: req.params.id, ...liveEventWhere() } });
  if (!event) throw notFound('Event not found');
  await prisma.engagementEntry.upsert({
    where: { eventId_memberId: { eventId: event.id, memberId: auth.member.id } },
    create: { eventId: event.id, memberId: auth.member.id, dismissedAt: new Date() },
    update: { dismissedAt: new Date() },
  });
  return ok(res, { dismissed: true });
});

engagementRouter.post('/:id/submit', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const event = await loadEngagement(req.params.id);
  if (!event || !event.published) throw notFound('Event not found');
  const now = new Date();
  if (event.startsAt > now || event.endsAt < now) throw forbidden('This event is not live');
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid answers');

  const questionIds = new Set(event.questions.map((row) => row.id));
  const optionByQuestion = new Map(event.questions.map((question) => [question.id, new Set(question.options.map((option) => option.id))]));
  for (const answer of parsed.data.answers) {
    if (!questionIds.has(answer.questionId) || !optionByQuestion.get(answer.questionId)?.has(answer.optionId)) {
      throw badRequest('Answer does not match this event');
    }
  }

  const entry = await prisma.$transaction(async (tx) => {
    const row = await tx.engagementEntry.upsert({
      where: { eventId_memberId: { eventId: event.id, memberId: auth.member.id } },
      create: { eventId: event.id, memberId: auth.member.id, completedAt: now },
      update: { completedAt: now },
    });
    await tx.engagementAnswer.deleteMany({ where: { entryId: row.id } });
    await tx.engagementAnswer.createMany({
      data: parsed.data.answers.map((answer) => ({
        entryId: row.id,
        questionId: answer.questionId,
        optionId: answer.optionId,
      })),
    });
    return row;
  });

  const picked = new Map(parsed.data.answers.map((answer) => [answer.questionId, answer.optionId]));
  let correct = 0;
  if (event.type === 'QUIZ') {
    for (const question of event.questions) {
      const right = question.options.find((option) => option.isCorrect)?.id;
      if (right && picked.get(question.id) === right) correct += 1;
    }
  }

  const counts = event.type === 'POLL'
    ? await prisma.engagementAnswer.groupBy({
        by: ['optionId'],
        where: { questionId: { in: event.questions.map((row) => row.id) } },
        _count: { optionId: true },
      })
    : [];

  return ok(res, {
    completed: true,
    entryId: entry.id,
    score: event.type === 'QUIZ' ? { correct, total: event.questions.length } : null,
    event: serializeEngagementPlay(event, event.type === 'QUIZ'),
    pollCounts: Object.fromEntries(counts.map((row) => [row.optionId, row._count.optionId])),
  });
});
