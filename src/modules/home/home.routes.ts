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
import { localLeaderboardSnapshot } from '../leaderboard/leaderboard.shared.js';

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
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const [tasksDue, ledger, healthComponents, lastWork, nearbyCards, pannaAppointed, membersAdded, currentEvents, activitiesThisMonth, issuesTimestamp, localBoard] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: member.id, status: { in: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] } },
      include: { assigner: true },
      orderBy: { dueAt: 'asc' },
      take: 8,
    }),
    prisma.pointLedgerEntry.findMany({
      where: { memberId: member.id, periodMonth: monthStart },
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
    // Events the member joined that have not ended yet — same rule as GET /events/joined.
    prisma.orgEvent.count({
      where: {
        deletedAt: null,
        endsAt: { gt: new Date() },
        joins: { some: { memberId: member.id } },
      },
    }),
    // Work the member recorded this calendar month. Rejected entries do not count.
    prisma.activity.count({
      where: {
        actorId: member.id,
        deletedAt: null,
        occurredAt: { gte: monthStart, lt: nextMonthStart },
        status: { in: ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'APPEALED'] },
      },
    }),
    issueSyncTimestamp(),
    localLeaderboardSnapshot(member),
  ]);
  const upcomingEvents = await listVisibleEvents(member, auth.auth.post, 5).catch(() => []);
  const regionTasks = await listVisibleOrgTasks(member, auth.auth.post, 12).catch(() => []);
  const activeEngagement = await findActiveEngagement(member.id).catch(() => null);
  const activityEvent = await findActiveActivityEvent(member.id).catch(() => null);

  const points = ledger.filter((e) => !e.pending).reduce((s, e) => s + (e.direction === 'CREDIT' ? e.points : -e.points), 0);
  const pendingPoints = ledger.filter((e) => e.pending && e.direction === 'CREDIT').reduce((s, e) => s + e.points, 0);
  const dueToday = tasksDue.filter((t) => {
    const d = new Date(t.dueAt);
    const now = new Date();
    return d.toDateString() === now.toDateString() || t.status === 'OVERDUE';
  });

  const mandalRank = localBoard.rank;
  const mandalSize = localBoard.total;

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
      currentEvents,
      activitiesThisMonth,
      points,
      pendingPoints,
      mandalRank,
      mandalSize,
      leaderboardScope: localBoard.scope,
      leaderboardArea: localBoard.name,
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
