import { Router } from 'express';
import { z } from 'zod';
import type { MemberStatus, PostType, Prisma } from '@prisma/client';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { adminAuthRouter } from './admin.auth.routes.js';
import { adminEngagementRouter } from './admin.engagement.routes.js';
import { requireAdmin, type AdminRequest } from './admin.auth.js';
import { adminMediaUrl, serializeAdminMember, serializeAdminOffice } from './admin.serialize.js';
import {
  ALL_POSTS,
  assignablePosts,
  canAssignPost,
  canManageMember,
  inMemberScope,
  labelOf,
  memberScopeWhere,
  POST_RANK,
  primaryPost,
  rankOf,
  scopeForPost,
  actorRank,
} from './admin.posts.js';

const listQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN']).optional(),
  post: z.enum(ALL_POSTS as [PostType, ...PostType[]]).optional(),
  stateId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const statusSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN']),
});

const assignSchema = z.object({
  post: z.enum(ALL_POSTS as [PostType, ...PostType[]]),
  isPrimary: z.boolean().default(true),
  stateId: z.string().uuid().nullish(),
  regionId: z.string().uuid().nullish(),
  districtId: z.string().uuid().nullish(),
  assemblyId: z.string().uuid().nullish(),
  mandalId: z.string().uuid().nullish(),
  boothId: z.string().uuid().nullish(),
  pageNumber: z.coerce.number().int().positive().nullish(),
});

const rejectSchema = z.object({
  reason: z.string().min(4).max(600),
});

const adminGraph = {
  booth: true,
  state: true,
  district: true,
  assembly: true,
  posts: { where: { endedAt: null }, orderBy: { startedAt: 'desc' as const } },
};

function asAdmin(req: unknown) {
  return req as AdminRequest;
}

export const adminRouter = Router();
adminRouter.use('/auth', adminAuthRouter);
adminRouter.use(requireAdmin);
adminRouter.use('/engagement-events', adminEngagementRouter);

adminRouter.get('/me', async (req, res) => {
  const auth = asAdmin(req);
  const member = await prisma.member.findFirstOrThrow({
    where: { id: auth.member.id },
    include: adminGraph,
  });
  return ok(res, {
    member: serializeAdminMember(member),
    rank: auth.rank,
    post: primaryPost(auth.member, auth.posts),
    assignablePosts: assignablePosts(auth.rank),
  });
});

adminRouter.get('/overview', async (req, res) => {
  const auth = asAdmin(req);
  const scope = memberScopeWhere(auth.member, auth.rank);
  const memberWhere = { deletedAt: null, ...scope };
  const [members, verified, pending, posts, activities, meetings, booths] = await Promise.all([
    prisma.member.count({ where: memberWhere }),
    prisma.member.count({ where: { ...memberWhere, status: 'VERIFIED' } }),
    prisma.member.count({ where: { ...memberWhere, status: { in: ['DRAFT', 'PENDING'] } } }),
    prisma.regionPost.count({ where: { deletedAt: null } }),
    prisma.activity.count({ where: { deletedAt: null } }),
    prisma.meeting.count(),
    prisma.booth.count({ where: { deletedAt: null } }),
  ]);
  return ok(res, { members, verified, pending, posts, activities, meetings, booths });
});

adminRouter.get('/members', async (req, res) => {
  const auth = asAdmin(req);
  const query = listQuery.parse(req.query);
  const page = Number(query.page);
  const take = Number(query.limit);
  const skip = (page - 1) * take;
  const scope = memberScopeWhere(auth.member, auth.rank);
  const where: Prisma.MemberWhereInput = { deletedAt: null, ...scope };
  if (query.status) where.status = query.status;
  if (query.stateId) where.stateId = query.stateId;
  if (query.districtId) where.districtId = query.districtId;
  if (query.q) {
    const term = query.q.trim();
    const digits = term.replace(/\D/g, '');
    where.OR = [
      { fullName: { contains: term, mode: 'insensitive' } },
      { membershipNumber: { contains: term, mode: 'insensitive' } },
      ...(digits
        ? [{ mobileE164: { contains: digits.length === 10 ? `+91${digits}` : digits } }]
        : []),
    ];
  }
  if (query.post) {
    where.posts = { some: { post: query.post, endedAt: null } };
  }
  const [total, rows] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      include: adminGraph,
      orderBy: { rowId: 'asc' },
      skip,
      take,
    }),
  ]);
  return ok(res, {
    total,
    page,
    limit: take,
    members: rows.map((row) => {
      const rank = actorRank(row, row.posts ?? []);
      return {
        ...serializeAdminMember(row),
        rank,
        canAssign: canManageMember(auth.rank, rank) && auth.member.id !== row.id,
        assignablePosts: canManageMember(auth.rank, rank) && auth.member.id !== row.id
          ? assignablePosts(auth.rank).filter((item) => canAssignPost(auth.rank, rank, item.post))
          : [],
        posts: (row.posts ?? []).map((post) => ({
          id: post.id,
          post: post.post,
          title: labelOf(post.post),
          isPrimary: post.isPrimary,
        })),
      };
    }),
  });
});

adminRouter.get('/assign/candidates', async (req, res) => {
  const auth = asAdmin(req);
  const scope = memberScopeWhere(auth.member, auth.rank);
  const rows = await prisma.member.findMany({
    where: { deletedAt: null, id: { not: auth.member.id }, ...scope },
    include: adminGraph,
    orderBy: { fullName: 'asc' },
    take: 300,
  });
  const members = rows
    .map((row) => {
      const rank = actorRank(row, row.posts ?? []);
      return {
        ...serializeAdminMember(row),
        rank,
        canAssign: canManageMember(auth.rank, rank),
        posts: assignablePosts(auth.rank).filter((item) => canAssignPost(auth.rank, rank, item.post)),
      };
    })
    .filter((row) => row.canAssign);
  return ok(res, {
    members,
    posts: assignablePosts(auth.rank),
  });
});

adminRouter.get('/members/:id', async (req, res) => {
  const auth = asAdmin(req);
  const member = await prisma.member.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: {
      ...adminGraph,
      posts: {
        where: { endedAt: null },
        include: { state: true, region: true, district: true, assembly: true, mandal: true, booth: true },
        orderBy: { startedAt: 'desc' },
      },
    },
  });
  if (!member) throw notFound('Member not found');
  if (!inMemberScope(auth.member, auth.rank, member)) throw forbidden('This member is outside your area');
  const rank = actorRank(member, member.posts);
  return ok(res, {
    member: serializeAdminMember(member),
    rank,
    canAssign: canManageMember(auth.rank, rank) && auth.member.id !== member.id,
    assignablePosts: assignablePosts(auth.rank).filter((item) => canAssignPost(auth.rank, rank, item.post)),
    posts: member.posts.map((post) => serializeAdminOffice(post)),
  });
});

adminRouter.patch('/members/:id', async (req, res) => {
  const auth = asAdmin(req);
  const { status } = statusSchema.parse(req.body);
  const member = await prisma.member.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: { posts: { where: { endedAt: null } } },
  });
  if (!member) throw notFound('Member not found');
  if (!inMemberScope(auth.member, auth.rank, member)) throw forbidden('This member is outside your area');
  if (member.isSuperAdmin && !auth.member.isSuperAdmin) throw forbidden('You cannot change a super admin');
  const rank = actorRank(member, member.posts);
  if (auth.rank <= rank) throw forbidden('You can only update members below your post');
  const updated = await prisma.member.update({
    where: { id: member.id },
    data: { status: status as MemberStatus },
    include: adminGraph,
  });
  return ok(res, { member: serializeAdminMember(updated) });
});

adminRouter.post('/members/:id/posts', async (req, res) => {
  const auth = asAdmin(req);
  const body = assignSchema.parse(req.body);
  const member = await prisma.member.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: { posts: { where: { endedAt: null } } },
  });
  if (!member) throw notFound('Member not found');
  if (!inMemberScope(auth.member, auth.rank, member)) throw forbidden('This member is outside your area');
  if (member.id === auth.member.id && !auth.member.isSuperAdmin) {
    throw forbidden('You cannot assign a post to yourself');
  }
  const rank = actorRank(member, member.posts);
  if (!canAssignPost(auth.rank, rank, body.post)) {
    throw forbidden('You can only assign a post below your own post');
  }
  const existing = member.posts.find((row) => row.post === body.post);
  const scope = scopeForPost(body.post, member, {
    stateId: body.stateId,
    regionId: body.regionId,
    districtId: body.districtId,
    assemblyId: body.assemblyId,
    mandalId: body.mandalId,
    boothId: body.boothId,
  });
  if (body.isPrimary) {
    await prisma.memberPost.updateMany({
      where: { memberId: member.id, endedAt: null, isPrimary: true },
      data: { isPrimary: false },
    });
  }
  if (existing) {
    await prisma.memberPost.update({
      where: { id: existing.id },
      data: { isPrimary: true, ...scope },
    });
  } else {
    await prisma.memberPost.create({
      data: {
        memberId: member.id,
        post: body.post,
        isPrimary: body.isPrimary || member.posts.length === 0,
        pageNumber: body.post === 'PANNA_PRAMUKH' ? (body.pageNumber ?? null) : null,
        ...scope,
      },
    });
  }
  const fresh = await prisma.member.findFirstOrThrow({
    where: { id: member.id },
    include: {
      ...adminGraph,
      posts: {
        where: { endedAt: null },
        include: { state: true, region: true, district: true, assembly: true, mandal: true, booth: true },
        orderBy: { startedAt: 'desc' },
      },
    },
  });
  return ok(res, {
    member: serializeAdminMember(fresh),
    posts: fresh.posts.map((post) => serializeAdminOffice(post)),
  });
});

adminRouter.delete('/members/:id/posts/:postId', async (req, res) => {
  const auth = asAdmin(req);
  const member = await prisma.member.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: { posts: { where: { endedAt: null } } },
  });
  if (!member) throw notFound('Member not found');
  if (!inMemberScope(auth.member, auth.rank, member)) throw forbidden('This member is outside your area');
  const row = member.posts.find((item) => item.id === String(req.params.postId));
  if (!row) throw notFound('Post not found');
  const rank = actorRank(member, member.posts);
  if (!canAssignPost(auth.rank, rank, row.post) && auth.rank <= rankOf(row.post)) {
    throw forbidden('You can only remove a post below your own post');
  }
  await prisma.memberPost.update({
    where: { id: row.id },
    data: { endedAt: new Date(), isPrimary: false },
  });
  if (row.isPrimary) {
    const next = member.posts.find((item) => item.id !== row.id);
    if (next) {
      await prisma.memberPost.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }
  const fresh = await prisma.member.findFirstOrThrow({
    where: { id: member.id },
    include: {
      ...adminGraph,
      posts: {
        where: { endedAt: null },
        include: { state: true, region: true, district: true, assembly: true, mandal: true, booth: true },
        orderBy: { startedAt: 'desc' },
      },
    },
  });
  return ok(res, {
    member: serializeAdminMember(fresh),
    posts: fresh.posts.map((post) => serializeAdminOffice(post)),
  });
});

adminRouter.get('/region-posts', async (_req, res) => {
  const rows = await prisma.regionPost.findMany({
    where: { deletedAt: null },
    include: { author: { select: { fullName: true, mobileE164: true } }, issue: true, subIssue: true },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return ok(res, {
    posts: rows.map((row) => ({
      id: row.id,
      description: row.description,
      mediaType: row.mediaType,
      mediaUrl: adminMediaUrl(row.mediaKey),
      thumbnailUrl: row.thumbnailKey ? adminMediaUrl(row.thumbnailKey) : null,
      regionLabel: row.regionLabel,
      createdAt: row.createdAt,
      authorName: row.author.fullName,
      authorMobile: row.author.mobileE164,
      issueName: row.issue.name,
      subIssueName: row.subIssue?.name ?? null,
      issuePriority: row.issue.priority,
    })),
  });
});

adminRouter.get('/activities', async (req, res) => {
  const auth = asAdmin(req);
  const boothWhere: Prisma.BoothWhereInput = {};
  if (auth.member.mandalId) boothWhere.mandalId = auth.member.mandalId;
  else if (auth.member.assemblyId) boothWhere.assemblyId = auth.member.assemblyId;
  else if (auth.member.districtId) boothWhere.districtId = auth.member.districtId;
  else if (auth.member.boothId) boothWhere.id = auth.member.boothId;
  const rows = await prisma.activity.findMany({
    where: {
      deletedAt: null,
      ...(Object.keys(boothWhere).length && auth.rank < POST_RANK.NATIONAL_GENERAL_SECRETARY
        ? { booth: boothWhere }
        : {}),
    },
    include: { actor: { select: { fullName: true, membershipNumber: true } }, booth: true },
    orderBy: { occurredAt: 'desc' },
    take: 80,
  });
  return ok(res, {
    activities: rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      occurredAt: row.occurredAt,
      notes: row.notes,
      actorName: row.actor.fullName,
      actorNumber: row.actor.membershipNumber,
      boothName: row.booth.name,
      boothCode: row.booth.code,
    })),
  });
});

adminRouter.get('/meetings', async (_req, res) => {
  const rows = await prisma.meeting.findMany({
    include: { host: { select: { fullName: true } }, booth: true, invitees: true, checkIns: true },
    orderBy: { startsAt: 'desc' },
    take: 80,
  });
  return ok(res, {
    meetings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      startsAt: row.startsAt,
      venue: row.venue,
      hostName: row.host.fullName,
      boothName: row.booth.name,
      invitees: row.invitees.length,
      checkIns: row.checkIns.length,
    })),
  });
});

adminRouter.get('/booths', async (req, res) => {
  const auth = asAdmin(req);
  const boothWhere: Prisma.BoothWhereInput = { deletedAt: null };
  if (auth.member.mandalId) boothWhere.mandalId = auth.member.mandalId;
  else if (auth.member.assemblyId) boothWhere.assemblyId = auth.member.assemblyId;
  else if (auth.member.districtId) boothWhere.districtId = auth.member.districtId;
  else if (auth.member.boothId) boothWhere.id = auth.member.boothId;
  const rows = await prisma.booth.findMany({
    where: boothWhere,
    include: { mandal: true, assembly: true, district: true },
    orderBy: { boothNumber: 'asc' },
    take: 200,
  });
  return ok(res, {
    booths: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      boothNumber: row.boothNumber,
      village: row.village,
      pincode: row.pincode,
      memberCount: row.memberCount,
      voterCount: row.voterCount,
      healthScore: row.healthScore,
      healthBand: row.healthBand,
      mandalName: row.mandal?.name ?? null,
      assemblyName: row.assembly?.name ?? null,
      districtName: row.district?.name ?? null,
    })),
  });
});

adminRouter.get('/verification', async (req, res) => {
  const auth = asAdmin(req);
  const items = await prisma.activity.findMany({
    where: {
      status: { in: ['QUEUED', 'UPLOADED', 'PENDING_VERIFICATION'] },
      booth: auth.member.isSuperAdmin || !auth.member.mandalId ? undefined : { mandalId: auth.member.mandalId },
    },
    include: { actor: { select: { fullName: true, membershipNumber: true } }, booth: true },
    orderBy: [{ reviewFlag: 'desc' }, { occurredAt: 'desc' }],
    take: 60,
  });
  return ok(res, {
    items: items.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      occurredAt: row.occurredAt,
      notes: row.notes,
      actorName: row.actor.fullName,
      actorNumber: row.actor.membershipNumber,
      boothName: row.booth.name,
      reviewFlag: row.reviewFlag,
    })),
  });
});

adminRouter.post('/verification/:id/accept', async (req, res) => {
  const auth = asAdmin(req);
  const activity = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!activity) throw notFound('Activity not found');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status: 'VERIFIED' },
  });
  await prisma.activityReview.create({
    data: { activityId: activity.id, reviewerId: auth.member.id, decision: 'VERIFIED' },
  });
  await prisma.pointLedgerEntry.updateMany({
    where: { activityId: activity.id, pending: true },
    data: { pending: false },
  });
  return ok(res, { activity: updated });
});

adminRouter.post('/verification/:id/reject', async (req, res) => {
  const auth = asAdmin(req);
  const { reason } = rejectSchema.parse(req.body);
  const activity = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!activity) throw notFound('Activity not found');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status: 'NOT_VERIFIED' },
  });
  await prisma.activityReview.create({
    data: { activityId: activity.id, reviewerId: auth.member.id, decision: 'NOT_VERIFIED', reason },
  });
  return ok(res, { activity: updated });
});

adminRouter.get('/organisation', async (_req, res) => {
  const levels = await prisma.orgLevel.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { posts: { orderBy: { title: 'asc' } } },
  });
  return ok(res, {
    levels: levels.map((level) => ({
      code: level.code,
      name: level.name,
      posts: level.posts.map((post) => ({
        post: post.post,
        title: post.title,
        rank: rankOf(post.post),
      })),
    })),
  });
});
