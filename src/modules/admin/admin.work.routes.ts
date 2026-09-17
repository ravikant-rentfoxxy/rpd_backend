import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { toNumber } from '../../lib/geo.js';
import type { AdminRequest } from './admin.auth.js';
import { adminMediaUrl } from './admin.serialize.js';
import { labelOf } from './admin.posts.js';
import {
  areaActivityWhere,
  areaHostedWhere,
  areaMemberWhere,
  areaName,
  areaRegionPostWhere,
} from './admin.scope.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TREND_DAYS = 30;

function asAdmin(req: unknown) {
  return req as AdminRequest;
}

/** Calendar day in India for a timestamp, e.g. "2026-09-17". */
function istDay(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function eventPhase(event: { startsAt: Date; endsAt: Date }, now = Date.now()) {
  if (event.endsAt.getTime() <= now) return 'ENDED' as const;
  if (event.startsAt.getTime() <= now) return 'LIVE' as const;
  return 'UPCOMING' as const;
}

/** Hosts can always manage their own items; otherwise only someone senior to the host. */
function canManageHosted(auth: AdminRequest, item: { hostId: string; hostRank: number }) {
  return auth.member.isSuperAdmin || item.hostId === auth.member.id || auth.rank > item.hostRank;
}

export const adminWorkRouter = Router();

/** Small badge counts for the portal navigation; cheap enough to poll. */
adminWorkRouter.get('/counts', async (req, res) => {
  const auth = asAdmin(req);
  const [awaitingReview, openGrievances] = await Promise.all([
    prisma.activity.count({
      where: {
        deletedAt: null,
        status: { in: ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION'] },
        actorId: { not: auth.member.id },
        AND: [areaActivityWhere(auth.area)],
      },
    }),
    prisma.regionPost.count({
      where: { deletedAt: null, status: 'OPEN', assignedToId: null, AND: [areaRegionPostWhere(auth.area)] },
    }),
  ]);
  return ok(res, { awaitingReview, openGrievances });
});

adminWorkRouter.get('/overview', async (req, res) => {
  const auth = asAdmin(req);
  const area = auth.area;
  const now = new Date();
  const trendStart = new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS);
  trendStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const members: Prisma.MemberWhereInput = { deletedAt: null, AND: [areaMemberWhere(area)] };
  const activities: Prisma.ActivityWhereInput = { deletedAt: null, AND: [areaActivityWhere(area)] };
  const grievances: Prisma.RegionPostWhereInput = { deletedAt: null, AND: [areaRegionPostWhere(area)] };
  const hosted = areaHostedWhere(area) as Prisma.OrgEventWhereInput;

  const [
    memberTotal,
    memberVerified,
    memberPending,
    memberNew,
    officeBearers,
    activityTotal,
    awaitingReview,
    grievanceOpen,
    grievanceUnassigned,
    grievanceResolved,
    eventsUpcoming,
    eventsLive,
    checkInsThisMonth,
    tasksTotal,
    trendRows,
    joinRows,
    recentActivities,
    nextEvents,
  ] = await Promise.all([
    prisma.member.count({ where: members }),
    prisma.member.count({ where: { ...members, status: 'VERIFIED' } }),
    prisma.member.count({ where: { ...members, status: { in: ['DRAFT', 'PENDING'] } } }),
    prisma.member.count({ where: { ...members, createdAt: { gte: monthStart } } }),
    prisma.member.count({ where: { ...members, posts: { some: { endedAt: null, post: { not: 'MEMBER' } } } } }),
    prisma.activity.count({ where: { ...activities, occurredAt: { gte: trendStart } } }),
    prisma.activity.count({
      where: { ...activities, status: { in: ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION'] } },
    }),
    prisma.regionPost.count({ where: { ...grievances, status: 'OPEN' } }),
    prisma.regionPost.count({ where: { ...grievances, status: 'OPEN', assignedToId: null } }),
    prisma.regionPost.count({ where: { ...grievances, status: 'RESOLVED', resolvedAt: { gte: monthStart } } }),
    prisma.orgEvent.count({ where: { deletedAt: null, AND: [hosted], startsAt: { gt: now } } }),
    prisma.orgEvent.count({ where: { deletedAt: null, AND: [hosted], startsAt: { lte: now }, endsAt: { gt: now } } }),
    prisma.orgEventJoin.count({
      where: { checkedInAt: { gte: monthStart }, event: { deletedAt: null, AND: [hosted] } },
    }),
    prisma.orgTask.count({ where: { deletedAt: null, AND: [areaHostedWhere(area) as Prisma.OrgTaskWhereInput] } }),
    prisma.activity.findMany({
      where: { ...activities, occurredAt: { gte: trendStart } },
      select: { type: true, status: true, occurredAt: true },
      take: 20000,
    }),
    prisma.member.findMany({
      where: { ...members, createdAt: { gte: trendStart } },
      select: { createdAt: true },
      take: 20000,
    }),
    prisma.activity.findMany({
      where: activities,
      include: { actor: { select: { fullName: true } }, booth: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 6,
    }),
    prisma.orgEvent.findMany({
      where: { deletedAt: null, AND: [hosted], endsAt: { gt: now } },
      include: { host: { select: { fullName: true } }, _count: { select: { joins: true } } },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
  ]);

  const days: string[] = [];
  for (let i = 0; i < TREND_DAYS; i++) days.push(istDay(new Date(trendStart.getTime() + i * DAY_MS)));
  const trend = new Map(days.map((day) => [day, { date: day, activities: 0, verified: 0, members: 0 }]));
  const mix = new Map<string, number>();
  for (const row of trendRows) {
    const bucket = trend.get(istDay(row.occurredAt));
    if (bucket) {
      bucket.activities += 1;
      if (row.status === 'VERIFIED') bucket.verified += 1;
    }
    mix.set(row.type, (mix.get(row.type) ?? 0) + 1);
  }
  for (const row of joinRows) {
    const bucket = trend.get(istDay(row.createdAt));
    if (bucket) bucket.members += 1;
  }

  return ok(res, {
    area: { level: area.level, name: await areaName(area) },
    members: { total: memberTotal, verified: memberVerified, pending: memberPending, newThisMonth: memberNew, officeBearers },
    activities: { last30Days: activityTotal, awaitingReview },
    grievances: { open: grievanceOpen, unassigned: grievanceUnassigned, resolvedThisMonth: grievanceResolved },
    events: { upcoming: eventsUpcoming, live: eventsLive, checkInsThisMonth },
    tasks: { total: tasksTotal },
    trend: [...trend.values()],
    activityMix: [...mix.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    recentActivities: recentActivities.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      occurredAt: row.occurredAt,
      actorName: row.actor.fullName,
      boothName: row.booth?.name ?? null,
    })),
    upcomingEvents: nextEvents.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      venue: row.venue,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      phase: eventPhase(row),
      hostName: row.host.fullName,
      joined: row._count.joins,
    })),
  });
});

adminWorkRouter.get('/activities/:id', async (req, res) => {
  const auth = asAdmin(req);
  const activity = await prisma.activity.findFirst({
    where: { id: String(req.params.id), deletedAt: null, AND: [areaActivityWhere(auth.area)] },
    include: {
      actor: { select: { id: true, fullName: true, membershipNumber: true, mobileE164: true, photoUrl: true } },
      booth: { select: { id: true, code: true, name: true, village: true } },
      photos: { orderBy: { capturedAt: 'asc' } },
      attendees: { include: { member: { select: { id: true, fullName: true, membershipNumber: true } } } },
      reviews: { include: { reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!activity) throw notFound('Activity not found in your area');
  return ok(res, {
    activity: {
      id: activity.id,
      type: activity.type,
      status: activity.status,
      occurredAt: activity.occurredAt,
      createdAt: activity.createdAt,
      notes: activity.notes,
      backdateReason: activity.backdateReason,
      farAwayReason: activity.farAwayReason,
      reviewFlag: activity.reviewFlag,
      homesCovered: activity.homesCovered,
      attendeeCount: activity.attendeeCount,
      distanceMetres: activity.distanceMetres,
      latitude: activity.latitude == null ? null : toNumber(activity.latitude),
      longitude: activity.longitude == null ? null : toNumber(activity.longitude),
      actor: {
        id: activity.actor.id,
        fullName: activity.actor.fullName,
        membershipNumber: activity.actor.membershipNumber,
        mobile: activity.actor.mobileE164,
        photoUrl: activity.actor.photoUrl ? adminMediaUrl(activity.actor.photoUrl) : null,
      },
      booth: activity.booth,
      photos: activity.photos.map((photo) => ({
        id: photo.id,
        kind: photo.kind,
        url: adminMediaUrl(photo.storageKey),
        capturedAt: photo.capturedAt,
      })),
      attendees: activity.attendees.map((row) => ({
        id: row.id,
        memberId: row.member?.id ?? null,
        name: row.member?.fullName ?? row.freeName ?? '',
        membershipNumber: row.member?.membershipNumber ?? null,
      })),
      reviews: activity.reviews.map((row) => ({
        id: row.id,
        decision: row.decision,
        reason: row.reason,
        reviewerName: row.reviewer.fullName,
        createdAt: row.createdAt,
      })),
      canReview:
        activity.actorId !== auth.member.id &&
        ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION'].includes(activity.status),
    },
  });
});

const eventQuery = z.object({
  phase: z.enum(['UPCOMING', 'LIVE', 'ENDED']).optional(),
  type: z.enum(['MEETING', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminWorkRouter.get('/events', async (req, res) => {
  const auth = asAdmin(req);
  const query = eventQuery.parse(req.query);
  const now = new Date();
  const and: Prisma.OrgEventWhereInput[] = [areaHostedWhere(auth.area) as Prisma.OrgEventWhereInput];
  if (query.type) and.push({ type: query.type });
  if (query.phase === 'UPCOMING') and.push({ startsAt: { gt: now } });
  if (query.phase === 'LIVE') and.push({ startsAt: { lte: now }, endsAt: { gt: now } });
  if (query.phase === 'ENDED') and.push({ endsAt: { lte: now } });
  const where: Prisma.OrgEventWhereInput = { deletedAt: null, AND: and };
  const [total, rows] = await Promise.all([
    prisma.orgEvent.count({ where }),
    prisma.orgEvent.findMany({
      where,
      include: {
        host: { select: { id: true, fullName: true } },
        joins: { select: { checkedInAt: true } },
      },
      orderBy: { startsAt: query.phase === 'ENDED' ? 'desc' : 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return ok(res, {
    total,
    page: query.page,
    limit: query.limit,
    events: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      venue: row.venue,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      phase: eventPhase(row),
      hostId: row.host.id,
      hostName: row.host.fullName,
      hostPost: labelOf(row.hostPost),
      imageUrl: row.imageUrl ? adminMediaUrl(row.imageUrl) : null,
      joined: row.joins.length,
      checkedIn: row.joins.filter((join) => join.checkedInAt).length,
      hasLocation: row.latitude != null && row.longitude != null,
      canManage: canManageHosted(auth, row),
    })),
  });
});

adminWorkRouter.get('/events/:id', async (req, res) => {
  const auth = asAdmin(req);
  const event = await prisma.orgEvent.findFirst({
    where: { id: String(req.params.id), deletedAt: null, AND: [areaHostedWhere(auth.area) as Prisma.OrgEventWhereInput] },
    include: {
      host: { select: { id: true, fullName: true, membershipNumber: true } },
      joins: {
        orderBy: [{ checkedInAt: 'asc' }, { createdAt: 'asc' }],
        include: { member: { select: { id: true, fullName: true, membershipNumber: true, mobileE164: true } } },
      },
    },
  });
  if (!event) throw notFound('Event not found in your area');
  return ok(res, {
    event: {
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.description ?? '',
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      phase: eventPhase(event),
      latitude: event.latitude == null ? null : toNumber(event.latitude),
      longitude: event.longitude == null ? null : toNumber(event.longitude),
      imageUrl: event.imageUrl ? adminMediaUrl(event.imageUrl) : null,
      host: { ...event.host, post: labelOf(event.hostPost) },
      createdAt: event.createdAt,
      canManage: canManageHosted(auth, event),
      attendees: event.joins.map((row) => ({
        memberId: row.member.id,
        fullName: row.member.fullName,
        membershipNumber: row.member.membershipNumber,
        mobile: row.member.mobileE164,
        joinedAt: row.createdAt,
        checkedInAt: row.checkedInAt,
        checkInMetres: row.checkInMetres,
      })),
    },
  });
});

adminWorkRouter.delete('/events/:id', async (req, res) => {
  const auth = asAdmin(req);
  const event = await prisma.orgEvent.findFirst({
    where: { id: String(req.params.id), deletedAt: null, AND: [areaHostedWhere(auth.area) as Prisma.OrgEventWhereInput] },
  });
  if (!event) throw notFound('Event not found in your area');
  if (!canManageHosted(auth, event)) throw forbidden('Only the host or someone senior can cancel this event');
  await prisma.orgEvent.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
  return ok(res, { cancelled: true });
});

const taskQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminWorkRouter.get('/tasks', async (req, res) => {
  const auth = asAdmin(req);
  const query = taskQuery.parse(req.query);
  const and: Prisma.OrgTaskWhereInput[] = [areaHostedWhere(auth.area) as Prisma.OrgTaskWhereInput];
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.OrgTaskWhereInput = { deletedAt: null, AND: and };
  const [total, rows] = await Promise.all([
    prisma.orgTask.count({ where }),
    prisma.orgTask.findMany({
      where,
      include: { host: { select: { id: true, fullName: true } }, _count: { select: { starts: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return ok(res, {
    total,
    page: query.page,
    limit: query.limit,
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      hostId: row.host.id,
      hostName: row.host.fullName,
      hostPost: labelOf(row.hostPost),
      createdAt: row.createdAt,
      started: row._count.starts,
      canManage: canManageHosted(auth, row),
    })),
  });
});

adminWorkRouter.get('/tasks/:id', async (req, res) => {
  const auth = asAdmin(req);
  const task = await prisma.orgTask.findFirst({
    where: { id: String(req.params.id), deletedAt: null, AND: [areaHostedWhere(auth.area) as Prisma.OrgTaskWhereInput] },
    include: {
      host: { select: { id: true, fullName: true } },
      starts: {
        orderBy: { startedAt: 'asc' },
        include: { member: { select: { id: true, fullName: true, membershipNumber: true } } },
      },
    },
  });
  if (!task) throw notFound('Task not found in your area');
  return ok(res, {
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      host: { ...task.host, post: labelOf(task.hostPost) },
      createdAt: task.createdAt,
      canManage: canManageHosted(auth, task),
      starters: task.starts.map((row) => ({
        memberId: row.member.id,
        fullName: row.member.fullName,
        membershipNumber: row.member.membershipNumber,
        startedAt: row.startedAt,
      })),
    },
  });
});

adminWorkRouter.delete('/tasks/:id', async (req, res) => {
  const auth = asAdmin(req);
  const task = await prisma.orgTask.findFirst({
    where: { id: String(req.params.id), deletedAt: null, AND: [areaHostedWhere(auth.area) as Prisma.OrgTaskWhereInput] },
  });
  if (!task) throw notFound('Task not found in your area');
  if (!canManageHosted(auth, task)) throw forbidden('Only the host or someone senior can remove this task');
  await prisma.orgTask.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  return ok(res, { removed: true });
});
