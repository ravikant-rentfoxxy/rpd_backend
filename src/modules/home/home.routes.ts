import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { serializeMember } from '../members/member.serialize.js';
import { issueSyncTimestamp } from '../../lib/issue-sync.js';
import { touchLastActive } from './last-active.js';
import { listVisibleEvents } from '../events/events.routes.js';
import { listVisibleOrgTasks } from '../tasks/tasks.routes.js';
import { findActiveEngagement, serializeEngagementPrompt } from '../engagement/engagement.shared.js';
import { findActiveActivityEvent } from '../activity-events/activity-events.routes.js';

export const homeRouter = Router();
homeRouter.use(requireAuth);

homeRouter.post('/active', async (req, res) => {
  const auth = req as AuthedRequest;
  const lastActiveAt = await touchLastActive(auth.member.id);
  return ok(res, { lastActiveAt });
});

homeRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: auth.member.id },
    include: {
      booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } },
      state: true,
      district: true,
      assembly: true,
      posts: { where: { endedAt: null } },
      card: true,
    },
  });

  const lastActiveAt = await touchLastActive(member.id);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const mandalFilter = member.mandalId ? { mandalId: member.mandalId, deletedAt: null } : { id: member.id };

  const [tasksDue, ledger, mandalMembers, healthComponents, lastWork, nearbyCards, pannaAppointed, membersAdded, meetingsHeld, issuesTimestamp] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: member.id, status: { in: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] } },
      include: { assigner: true },
      orderBy: { dueAt: 'asc' },
      take: 8,
    }),
    prisma.pointLedgerEntry.findMany({
      where: { memberId: member.id, periodMonth: monthStart },
    }),
    prisma.member.findMany({
      where: mandalFilter,
      select: { id: true },
    }),
    member.boothId
      ? prisma.boothHealthComponent.findMany({ where: { boothId: member.boothId } })
      : Promise.resolve([]),
    prisma.activity.findFirst({
      where: { actorId: member.id, deletedAt: null },
      orderBy: { occurredAt: 'desc' },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            reviewer: { include: { posts: { where: { endedAt: null } } } },
          },
        },
      },
    }),
    prisma.nearbyActivityCard.findMany({
      orderBy: { sortOrder: 'asc' },
      take: 8,
    }).catch(() => []),
    member.boothId
      ? prisma.memberPost.count({
          where: { boothId: member.boothId, post: 'PANNA_PRAMUKH', endedAt: null },
        })
      : Promise.resolve(0),
    prisma.member.count({ where: { recruitedById: member.id, status: { in: ['PENDING', 'VERIFIED'] } } }),
    prisma.activity.count({
      where: { actorId: member.id, type: 'MEETING', status: { in: ['VERIFIED', 'PENDING_VERIFICATION', 'QUEUED'] } },
    }),
    issueSyncTimestamp(),
  ]);
  const upcomingEvents = await listVisibleEvents(member, auth.auth.post, 5).catch(() => []);
  const regionTasks = await listVisibleOrgTasks(member, 12).catch(() => []);
  const activeEngagement = await findActiveEngagement(member.id).catch(() => null);
  const activityEvent = await findActiveActivityEvent(member.id).catch(() => null);

  const points = ledger.filter((e) => !e.pending).reduce((s, e) => s + (e.direction === 'CREDIT' ? e.points : -e.points), 0);
  const pendingPoints = ledger.filter((e) => e.pending && e.direction === 'CREDIT').reduce((s, e) => s + e.points, 0);
  const dueToday = tasksDue.filter((t) => {
    const d = new Date(t.dueAt);
    const now = new Date();
    return d.toDateString() === now.toDateString() || t.status === 'OVERDUE';
  });

  const mandalIds = mandalMembers.map((row) => row.id);
  const mandalLedger = mandalIds.length
    ? await prisma.pointLedgerEntry.findMany({
        where: { memberId: { in: mandalIds }, periodMonth: monthStart, pending: false },
        select: { memberId: true, direction: true, points: true },
      })
    : [];
  const scores = new Map<string, number>(mandalIds.map((id) => [id, 0]));
  for (const entry of mandalLedger) {
    const delta = entry.direction === 'CREDIT' ? entry.points : -entry.points;
    scores.set(entry.memberId, (scores.get(entry.memberId) ?? 0) + delta);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const mandalRank = Math.max(ranked.findIndex(([id]) => id === member.id) + 1, 1);
  const mandalSize = Math.max(mandalIds.length, 1);

  const weakest = [...healthComponents].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore)[0];
  const lastReview = lastWork?.reviews[0];
  const reviewerPosts = lastReview?.reviewer.posts ?? [];
  const reviewerPost = reviewerPosts.find((p) => p.isPrimary)?.post ?? reviewerPosts[0]?.post ?? null;

  return ok(res, {
    greetingName: member.fullName.split(' ')[0] || 'Karyakarta',
    verified: member.status === 'VERIFIED',
    verifyStatus: member.status,
    member: serializeMember(member),
    stats: {
      membersAdded,
      meetingsHeld,
      points,
      pendingPoints,
      mandalRank,
      mandalSize,
      boothScore: member.booth?.healthScore ?? 0,
      boothWeakest: weakest?.detail ?? weakest?.label ?? null,
      pannaAppointed,
    },
    tasksDueToday: [
      ...dueToday.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueAt: t.dueAt,
        assignerName: t.assigner.fullName,
      })),
      ...regionTasks.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueAt: t.createdAt,
        assignerName: t.assignerName,
      })),
    ],
    issuesTimestamp,
    lastActiveAt,
    lastActivity: lastWork
      ? {
          id: lastWork.id,
          type: lastWork.type,
          status: lastWork.status,
          occurredAt: lastWork.occurredAt,
          reviewerName: lastReview?.reviewer.fullName ?? null,
          reviewerPost,
        }
      : null,
    nearbyActivities: nearbyCards.map((card) => ({
      id: card.id,
      title: card.title,
      place: card.placeLabel,
      imageUrl: card.imageUrl,
    })),
    upcomingEvents,
    engagement: activeEngagement ? serializeEngagementPrompt(activeEngagement) : null,
    activityEvent,
  });
});
