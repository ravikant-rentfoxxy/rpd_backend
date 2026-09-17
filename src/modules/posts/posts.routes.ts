import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { issueSyncTimestamp } from '../../lib/issue-sync.js';
import { putMemberPhoto, putStreamVideo } from '../../lib/storage.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { postMediaFields } from '../../middleware/upload.js';
import type { Prisma, RegionPostMedia } from '@prisma/client';
import { actorRank, labelOf, primaryPost } from '../admin/admin.posts.js';
import { assignScopeWhere, canReceiveAssignment, inAssignScope } from './assign.scope.js';
import { notifyPostAssigned } from '../../lib/push.js';
import { generatePostSummary } from '../../lib/gemini.js';
import { mediaPublicUrl } from '../../lib/storage.js';
import {
  canAssignPostIssue,
  canResolvePostIssue,
  canSummariseGrievancePost,
  postInclude,
  serializePost,
  viewerRankOf,
  type RegionPostRow,
} from './posts.serialize.js';

const uuid = z.string().uuid();

function extFor(mime: string, original: string) {
  const fromName = original.split('.').pop()?.toLowerCase() ?? '';
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.startsWith('image/')) return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  if (mime.startsWith('audio/')) return mime.includes('mpeg') ? 'mp3' : 'm4a';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime === 'application/msword') return 'doc';
  return 'mp4';
}

function mediaKind(mime: string, declared?: string): RegionPostMedia {
  if (declared === 'IMAGE' || declared === 'AUDIO' || declared === 'VIDEO') return declared;
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'IMAGE';
}

function serializeIssue(issue: {
  id: string;
  code: string;
  name: string;
  nameHi: string;
  nameBho: string;
  priority: number;
  band: string;
  reason: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  return {
    id: issue.id,
    code: issue.code,
    name: issue.name,
    nameHi: issue.nameHi,
    nameBho: issue.nameBho,
    priority: issue.priority,
    sortOrder: issue.sortOrder ?? 0,
    band: issue.band,
    reason: issue.reason,
    parentId: issue.parentId ?? null,
  };
}

async function resolveIssue(issueId?: string, issueCode?: string) {
  if (issueId) {
    const issue = await prisma.postIssue.findUnique({ where: { id: issueId } });
    if (issue) return issue;
  }
  if (issueCode) {
    const issue = await prisma.postIssue.findUnique({ where: { code: issueCode.toUpperCase() } });
    if (issue) return issue;
  }
  return null;
}

function asPost(post: unknown): RegionPostRow {
  return post as RegionPostRow;
}

async function findRegionPost(id: string) {
  return prisma.regionPost.findFirst({
    where: { deletedAt: null, OR: [{ id }, { clientUuid: id }] },
    include: postInclude,
  });
}

export const postsRouter = Router();
postsRouter.use(requireAuth);

postsRouter.get('/issues', async (_req, res) => {
  const [items, timestamp] = await Promise.all([
    prisma.postIssue.findMany({
      where: { parentId: null },
      orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
      include: { children: { orderBy: { sortOrder: 'asc' } } },
    }),
    issueSyncTimestamp(),
  ]);
  return ok(res, {
    issues: items.map((issue) => ({
      ...serializeIssue(issue),
      children: issue.children.map(serializeIssue),
    })),
    timestamp,
  });
});

postsRouter.get('/', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const member = auth.member;
  const filters: Prisma.RegionPostWhereInput[] = [{ authorId: member.id }, { assignedToId: member.id }];
  if (member.districtId) filters.push({ districtId: member.districtId });
  if (member.assemblyId) filters.push({ assemblyId: member.assemblyId });
  const items = await prisma.regionPost.findMany({
    where: member.isSuperAdmin ? { deletedAt: null } : { deletedAt: null, OR: filters },
    include: postInclude,
    orderBy: [{ issue: { priority: 'asc' } }, { createdAt: 'desc' }],
    take: 80,
  });
  return ok(res, { posts: items.map((post) => serializePost(asPost(post), member, auth.auth.post)) });
});

postsRouter.get('/grievances', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const member = auth.member;
  const viewerRank = viewerRankOf(member, auth.auth.post);
  if (viewerRank <= 10 && !member.isSuperAdmin) {
    throw forbidden('Only office bearers can open grievances');
  }
  const filters: Prisma.RegionPostWhereInput[] = [];
  if (member.districtId) filters.push({ districtId: member.districtId });
  if (member.assemblyId) filters.push({ assemblyId: member.assemblyId });
  if (!member.isSuperAdmin && !filters.length) {
    return ok(res, { posts: [] });
  }
  const items = await prisma.regionPost.findMany({
    where: {
      deletedAt: null,
      status: 'OPEN',
      ...(member.isSuperAdmin ? {} : { OR: filters }),
    },
    include: postInclude,
    orderBy: [{ issue: { priority: 'asc' } }, { createdAt: 'desc' }],
    take: 100,
  });
  const posts = items
    .filter((post) => canSummariseGrievancePost(member, viewerRank, post))
    .map((post) => serializePost(asPost(post), member, auth.auth.post));
  return ok(res, { posts });
});

postsRouter.get('/:id/assignees', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const post = await findRegionPost(req.params.id);
  if (!post) throw notFound('Post not found');
  const viewerRank = viewerRankOf(auth.member, auth.auth.post);
  if (!canAssignPostIssue(auth.member, viewerRank, post.author)) {
    throw forbidden('Only a higher authority can assign this issue');
  }
  const members = await prisma.member.findMany({
    where: {
      deletedAt: null,
      id: { not: post.authorId },
      ...assignScopeWhere(auth.member),
    },
    select: {
      id: true,
      fullName: true,
      isSuperAdmin: true,
      posts: { where: { endedAt: null }, select: { post: true, isPrimary: true, endedAt: true } },
    },
    take: 80,
    orderBy: { fullName: 'asc' },
  });
  const items = members
    .filter((row) => canReceiveAssignment(actorRank(row, row.posts), viewerRank))
    .map((row) => {
      const postCode = primaryPost(row, row.posts);
      return {
        id: row.id,
        fullName: row.fullName,
        post: postCode,
        postLabel: labelOf(postCode),
      };
    });
  return ok(res, { members: items });
});

postsRouter.get('/:id', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const post = await findRegionPost(req.params.id);
  if (!post) throw notFound('Post not found');
  return ok(res, { post: serializePost(asPost(post), auth.member, auth.auth.post) });
});

postsRouter.post('/:id/summary', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const post = await findRegionPost(req.params.id);
  if (!post) throw notFound('Post not found');
  const viewerRank = viewerRankOf(auth.member, auth.auth.post);
  if (!canSummariseGrievancePost(auth.member, viewerRank, post)) {
    throw forbidden('Summary is only available for open grievance posts');
  }

  let image: { mimeType: string; base64: string } | null = null;
  if (post.mediaType === 'IMAGE' && post.mediaKey) {
    try {
      const url = mediaPublicUrl(post.mediaKey);
      const mediaRes = await fetch(url);
      if (mediaRes.ok) {
        const buffer = Buffer.from(await mediaRes.arrayBuffer());
        if (buffer.byteLength > 0 && buffer.byteLength < 4_000_000) {
          const mime = mediaRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
          image = { mimeType: mime, base64: buffer.toString('base64') };
        }
      }
    } catch {
      image = null;
    }
  }

  const summary = await generatePostSummary({
    issue: post.issue?.name,
    issueCode: post.issue?.code,
    subIssue: post.subIssue?.name,
    description: post.description,
    region: post.regionLabel,
    authorName: post.author?.fullName,
    assigneeName: post.assignedTo?.fullName,
    status: post.status,
    image,
  });
  return ok(res, { summary });
});

postsRouter.post('/:id/assign', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const parsed = z.object({ memberId: uuid.nullable().optional() }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Select a member');
  const post = await findRegionPost(req.params.id);
  if (!post) throw notFound('Post not found');
  const viewerRank = viewerRankOf(auth.member, auth.auth.post);
  if (!canAssignPostIssue(auth.member, viewerRank, post.author)) {
    throw forbidden('Only a higher authority can assign this issue');
  }
  const memberId = parsed.data.memberId ?? null;
  if (!memberId) {
    const updated = await prisma.regionPost.update({
      where: { id: post.id },
      data: { assignedToId: null, assignedById: null, assignedAt: null, assigneePost: null },
      include: postInclude,
    });
    return ok(res, { post: serializePost(asPost(updated), auth.member, auth.auth.post) });
  }
  if (memberId === post.authorId) throw badRequest('Assign this issue to someone else');
  const assignee = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    include: { posts: { where: { endedAt: null } } },
  });
  if (!assignee) throw badRequest('Member not found');
  if (!canReceiveAssignment(actorRank(assignee, assignee.posts), viewerRank)) {
    throw forbidden('Assign this issue to an office bearer below your level');
  }
  if (!inAssignScope(auth.member, assignee)) {
    throw forbidden('That member is outside your area');
  }
  const updated = await prisma.regionPost.update({
    where: { id: post.id },
    data: {
      assignedToId: assignee.id,
      assignedById: auth.member.id,
      assignedAt: new Date(),
      assigneePost: primaryPost(assignee, assignee.posts),
    },
    include: postInclude,
  });
  const issueLabel = updated.subIssue?.name || updated.issue?.name || 'Grievance';
  notifyPostAssigned({
    postId: updated.id,
    issueLabel,
    assigneeId: assignee.id,
    assigneeName: assignee.fullName,
    authorId: updated.authorId,
    assignerName: auth.member.fullName,
  });
  return ok(res, { post: serializePost(asPost(updated), auth.member, auth.auth.post) });
});

postsRouter.post('/:id/resolve', async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const parsed = z.object({ status: z.enum(['OPEN', 'RESOLVED']) }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Select a status');
  const post = await findRegionPost(req.params.id);
  if (!post) throw notFound('Post not found');
  const viewerRank = viewerRankOf(auth.member, auth.auth.post);
  if (!canResolvePostIssue(auth.member, viewerRank, post.author)) {
    throw forbidden('Only a higher authority can resolve this issue');
  }
  const resolved = parsed.data.status === 'RESOLVED';
  const updated = await prisma.regionPost.update({
    where: { id: post.id },
    data: resolved
      ? { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: auth.member.id }
      : { status: 'OPEN', resolvedAt: null, resolvedById: null },
    include: postInclude,
  });
  return ok(res, { post: serializePost(asPost(updated), auth.member, auth.auth.post) });
});

postsRouter.post('/', postMediaFields, async (req, res) => {
  const auth = req as unknown as AuthedRequest;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  const thumbnail = files?.thumbnail?.[0];
  const document = files?.document?.[0];
  const optionalUuid = z.preprocess((value) => (value === '' || value == null ? undefined : value), uuid.optional());
  const parsed = z
    .object({
      clientUuid: uuid,
      description: z.string().trim().max(2000).optional(),
      mediaType: z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'image', 'audio', 'video']).optional(),
      issueId: optionalUuid,
      issueCode: z.string().trim().max(40).optional(),
      subIssueId: optionalUuid,
      subIssueCode: z.string().trim().max(40).optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      districtId: optionalUuid,
      assemblyId: optionalUuid,
      boothId: optionalUuid,
      regionLabel: z.string().trim().max(200).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid post');
  const body = parsed.data;
  const pickedIssue = await resolveIssue(body.issueId, body.issueCode);
  const pickedSub = await resolveIssue(body.subIssueId, body.subIssueCode);
  const category = pickedIssue?.parentId
    ? await prisma.postIssue.findUnique({ where: { id: pickedIssue.parentId } })
    : pickedIssue;
  const subIssue = pickedSub?.parentId
    ? pickedSub
    : pickedIssue?.parentId
      ? pickedIssue
      : null;
  if (!category || category.parentId) throw badRequest('Select an issue');
  if (!subIssue || subIssue.parentId !== category.id) throw badRequest('Select a sub-issue');
  const description = body.description ?? '';
  if (!file && !description) throw badRequest('Add a photo, audio or video, or write a description');
  const existing = await prisma.regionPost.findUnique({
    where: { clientUuid: body.clientUuid },
    include: postInclude,
  });
  if (existing) return created(res, { post: serializePost(asPost(existing), auth.member, auth.auth.post) });

  let type: RegionPostMedia = 'IMAGE';
  let key = '';
  let thumbnailKey: string | undefined;
  let documentKey: string | undefined;
  let documentName: string | undefined;
  if (file) {
    type = mediaKind(file.mimetype, body.mediaType?.toUpperCase());
    if (type === 'IMAGE' && !file.mimetype.startsWith('image/')) throw badRequest('Use a photo file');
    if (type === 'AUDIO' && !file.mimetype.startsWith('audio/')) throw badRequest('Use an audio file');
    if (type === 'VIDEO' && !file.mimetype.startsWith('video/')) throw badRequest('Use a video file');
    if (type === 'VIDEO') {
      if (!file.buffer?.byteLength) throw badRequest('Video file is empty');
      const uploaded = await putStreamVideo(
        description || `Post ${body.clientUuid}`,
        file.buffer,
        file.mimetype || 'video/mp4',
      );
      key = uploaded.key;
    } else {
      key = `posts/${auth.member.id}/${randomUUID()}.${extFor(file.mimetype, file.originalname)}`;
      await putMemberPhoto(key, file.buffer, file.mimetype || 'application/octet-stream');
    }
    if (thumbnail && (type === 'VIDEO' || thumbnail.mimetype.startsWith('image/'))) {
      thumbnailKey = `posts/${auth.member.id}/${randomUUID()}.${extFor(thumbnail.mimetype || 'image/jpeg', thumbnail.originalname || 'thumb.jpg')}`;
      await putMemberPhoto(thumbnailKey, thumbnail.buffer, thumbnail.mimetype || 'image/jpeg');
    }
  }
  if (document?.buffer?.byteLength) {
    documentName = document.originalname?.trim() || 'document';
    documentKey = `posts/${auth.member.id}/docs/${randomUUID()}.${extFor(document.mimetype, document.originalname || 'document.pdf')}`;
    await putMemberPhoto(documentKey, document.buffer, document.mimetype || 'application/octet-stream');
  }
  const post = await prisma.regionPost.create({
    data: {
      clientUuid: body.clientUuid,
      authorId: auth.member.id,
      issueId: category.id,
      subIssueId: subIssue.id,
      description,
      mediaType: type,
      mediaKey: key,
      thumbnailKey,
      documentKey,
      documentName,
      latitude: body.latitude,
      longitude: body.longitude,
      districtId: body.districtId ?? auth.member.districtId,
      assemblyId: body.assemblyId ?? auth.member.assemblyId,
      boothId: body.boothId ?? auth.member.boothId,
      regionLabel: body.regionLabel,
    },
    include: postInclude,
  });
  return created(res, { post: serializePost(asPost(post), auth.member, auth.auth.post) });
});
