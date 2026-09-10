import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const engagementInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' as const },
    include: { options: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

export type EngagementRow = Prisma.EngagementEventGetPayload<{ include: typeof engagementInclude }>;

export function serializeEngagementPrompt(event: { id: string; type: string; title: string; description: string; startsAt: Date; endsAt: Date }) {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
  };
}

export function serializeEngagementPlay(event: EngagementRow, revealCorrect: boolean) {
  return {
    ...serializeEngagementPrompt(event),
    questions: event.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(revealCorrect ? { isCorrect: option.isCorrect } : {}),
      })),
    })),
  };
}

export function liveEventWhere(now = new Date()): Prisma.EngagementEventWhereInput {
  return {
    deletedAt: null,
    published: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
  };
}

export async function findActiveEngagement(memberId: string) {
  const now = new Date();
  const events = await prisma.engagementEvent.findMany({
    where: liveEventWhere(now),
    orderBy: { startsAt: 'desc' },
    take: 8,
  });
  if (!events.length) return null;
  const entries = await prisma.engagementEntry.findMany({
    where: { memberId, eventId: { in: events.map((row) => row.id) } },
  });
  const closed = new Set(
    entries.filter((row) => row.dismissedAt || row.completedAt).map((row) => row.eventId),
  );
  return events.find((event) => !closed.has(event.id)) ?? null;
}

export async function loadEngagement(id: string) {
  return prisma.engagementEvent.findFirst({
    where: { id, deletedAt: null },
    include: engagementInclude,
  });
}
