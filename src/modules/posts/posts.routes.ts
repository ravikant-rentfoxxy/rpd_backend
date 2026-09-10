import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl, putMemberPhoto } from '../../lib/storage.js';
import { badRequest } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { postMediaFields } from '../../middleware/upload.js';
import type { Prisma, RegionPost, RegionPostMedia } from '@prisma/client';

const uuid = z.string().uuid();

function extFor(mime: string, original: string) {
  const fromName = original.split('.').pop()?.toLowerCase() ?? '';
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.startsWith('image/')) return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  if (mime.startsWith('audio/')) return mime.includes('mpeg') ? 'mp3' : 'm4a';
  return 'mp4';
}

function mediaKind(mime: string, declared?: string): RegionPostMedia {
  if (declared === 'IMAGE' || declared === 'AUDIO' || declared === 'VIDEO') return declared;
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'IMAGE';
}

function serializePost(post: RegionPost & { author: { fullName: string; mobileE164: string } }) {
  const type = post.mediaType.toLowerCase();
  const thumbnailUrl = post.thumbnailKey ? mediaPublicUrl(post.thumbnailKey) : null;
  return {
    id: post.clientUuid,
    serverId: post.id,
    clientUuid: post.clientUuid,
    description: post.description,
    mediaType: type,
    mediaKey: post.mediaKey,
    mediaUrl: mediaPublicUrl(post.mediaKey),
    mediaPath: mediaPublicUrl(post.mediaKey),
    thumbnailKey: post.thumbnailKey,
    thumbnailUrl,
    thumbnailPath: thumbnailUrl,
    pending: false,
    createdAt: post.createdAt.toISOString(),
    latitude: post.latitude == null ? null : Number(post.latitude),
    longitude: post.longitude == null ? null : Number(post.longitude),
    authorId: post.authorId,
    authorName: post.author.fullName,
    authorMobile: post.author.mobileE164,
    districtId: post.districtId,
    assemblyId: post.assemblyId,
    boothId: post.boothId,
    regionLabel: post.regionLabel,
  };
}

const authorSelect = { fullName: true, mobileE164: true } as const;

export const postsRouter = Router();
postsRouter.use(requireAuth);

postsRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const member = auth.member;
  const filters: Prisma.RegionPostWhereInput[] = [{ authorId: member.id }];
  if (member.districtId) filters.push({ districtId: member.districtId });
  if (member.assemblyId) filters.push({ assemblyId: member.assemblyId });
  const items = await prisma.regionPost.findMany({
    where: member.isSuperAdmin ? { deletedAt: null } : { deletedAt: null, OR: filters },
    include: { author: { select: authorSelect } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return ok(res, { posts: items.map(serializePost) });
});

postsRouter.post('/', postMediaFields, async (req, res) => {
  const auth = req as AuthedRequest;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  const thumbnail = files?.thumbnail?.[0];
  if (!file) throw badRequest('Add a photo, audio or video');
  const optionalUuid = z.preprocess((value) => (value === '' || value == null ? undefined : value), uuid.optional());
  const parsed = z
    .object({
      clientUuid: uuid,
      description: z.string().trim().max(2000).optional(),
      mediaType: z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'image', 'audio', 'video']).optional(),
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
  const existing = await prisma.regionPost.findUnique({
    where: { clientUuid: body.clientUuid },
    include: { author: { select: authorSelect } },
  });
  if (existing) return created(res, { post: serializePost(existing) });

  const type = mediaKind(file.mimetype, body.mediaType?.toUpperCase());
  if (type === 'IMAGE' && !file.mimetype.startsWith('image/')) throw badRequest('Use a photo file');
  if (type === 'AUDIO' && !file.mimetype.startsWith('audio/')) throw badRequest('Use an audio file');
  if (type === 'VIDEO' && !file.mimetype.startsWith('video/')) throw badRequest('Use a video file');

  const key = `posts/${auth.member.id}/${randomUUID()}.${extFor(file.mimetype, file.originalname)}`;
  await putMemberPhoto(key, file.buffer, file.mimetype || 'application/octet-stream');
  let thumbnailKey: string | undefined;
  if (thumbnail && (type === 'VIDEO' || thumbnail.mimetype.startsWith('image/'))) {
    thumbnailKey = `posts/${auth.member.id}/${randomUUID()}.${extFor(thumbnail.mimetype || 'image/jpeg', thumbnail.originalname || 'thumb.jpg')}`;
    await putMemberPhoto(thumbnailKey, thumbnail.buffer, thumbnail.mimetype || 'image/jpeg');
  }
  const post = await prisma.regionPost.create({
    data: {
      clientUuid: body.clientUuid,
      authorId: auth.member.id,
      description: body.description ?? '',
      mediaType: type,
      mediaKey: key,
      thumbnailKey,
      latitude: body.latitude,
      longitude: body.longitude,
      districtId: body.districtId ?? auth.member.districtId,
      assemblyId: body.assemblyId ?? auth.member.assemblyId,
      boothId: body.boothId ?? auth.member.boothId,
      regionLabel: body.regionLabel,
    },
    include: { author: { select: authorSelect } },
  });
  return created(res, { post: serializePost(post) });
});
