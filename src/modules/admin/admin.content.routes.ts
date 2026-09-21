import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Blog, Video } from '@prisma/client';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { mediaPublicUrl, putMemberPhoto, putStreamVideo, streamThumbnailUrl, streamVideoId } from '../../lib/storage.js';
import { contentMediaFields } from '../../middleware/upload.js';
import type { AdminRequest } from './admin.auth.js';

type Uploads = Partial<Record<'file' | 'thumbnail', Express.Multer.File[]>>;

const listQuery = z.object({
  q: z.string().trim().optional(),
  published: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Multipart sends every field as a string, so booleans arrive as "true" / "false". */
const flag = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const urlField = z.string().trim().url('Enter a valid link').max(1000);

const videoBody = z.object({
  title: z.string().trim().min(2, 'Give the video a title').max(200),
  description: z.string().trim().max(2000).default(''),
  externalUrl: urlField.optional().or(z.literal('')),
  published: flag.optional(),
});

const blogBody = z.object({
  title: z.string().trim().min(2, 'Give the blog a title').max(200),
  description: z.string().trim().max(2000).default(''),
  body: z.string().trim().max(50_000).default(''),
  externalUrl: urlField.optional().or(z.literal('')),
  published: flag.optional(),
});

const authorSelect = { id: true, fullName: true, membershipNumber: true } as const;
type Author = { id: string; fullName: string; membershipNumber: string | null };

function asAdmin(req: unknown) {
  return req as AdminRequest;
}

function uploadsOf(req: unknown) {
  return ((req as { files?: Uploads }).files ?? {}) as Uploads;
}

/** Express 5 widens params to string | string[] once multer joins the chain. */
function paramId(req: { params: Record<string, unknown> }) {
  return String(req.params.id ?? '');
}

function extFor(mime: string, original: string) {
  const fromName = original.split('.').pop()?.toLowerCase() ?? '';
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function putThumbnail(kind: 'videos' | 'blogs', memberId: string, file: Express.Multer.File) {
  const key = `content/${kind}/${memberId}/${randomUUID()}.${extFor(file.mimetype, file.originalname || 'thumb.jpg')}`;
  await putMemberPhoto(key, file.buffer, file.mimetype || 'image/jpeg');
  return key;
}

/** Falls back to the Bunny Stream poster frame when no thumbnail was uploaded. */
function thumbnailUrlOf(thumbnailKey: string | null, mediaKey?: string | null) {
  if (thumbnailKey) return mediaPublicUrl(thumbnailKey);
  const videoId = mediaKey ? streamVideoId(mediaKey) : null;
  return videoId ? streamThumbnailUrl(videoId) : null;
}

function serializeVideo(video: Video & { author?: Author | null }) {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    source: video.mediaKey ? ('UPLOAD' as const) : ('LINK' as const),
    videoUrl: video.mediaKey ? mediaPublicUrl(video.mediaKey) : video.externalUrl,
    externalUrl: video.externalUrl,
    thumbnailUrl: thumbnailUrlOf(video.thumbnailKey, video.mediaKey),
    published: video.published,
    author: video.author ? { id: video.author.id, fullName: video.author.fullName } : null,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
  };
}

function serializeBlog(blog: Blog & { author?: Author | null }) {
  return {
    id: blog.id,
    title: blog.title,
    description: blog.description,
    body: blog.body,
    externalUrl: blog.externalUrl,
    thumbnailUrl: thumbnailUrlOf(blog.thumbnailKey),
    published: blog.published,
    author: blog.author ? { id: blog.author.id, fullName: blog.author.fullName } : null,
    createdAt: blog.createdAt.toISOString(),
    updatedAt: blog.updatedAt.toISOString(),
  };
}

/** Only the author or a super admin may change a published item. */
function assertCanEdit(req: unknown, authorId: string) {
  const auth = asAdmin(req);
  if (auth.member.isSuperAdmin || auth.member.id === authorId) return auth;
  throw forbidden('Only the author or a super admin can change this');
}

function listWhere(query: z.infer<typeof listQuery>) {
  return {
    deletedAt: null,
    ...(query.published ? { published: query.published === 'true' } : {}),
    ...(query.q
      ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { description: { contains: query.q, mode: 'insensitive' as const } }] }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export const adminVideoRouter = Router();

adminVideoRouter.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid filter');
  const query = parsed.data;
  const where = listWhere(query);
  const [total, videos] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      include: { author: { select: authorSelect } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return ok(res, { videos: videos.map(serializeVideo), total, page: query.page, limit: query.limit });
});

adminVideoRouter.post('/', contentMediaFields, async (req, res) => {
  const auth = asAdmin(req);
  const parsed = videoBody.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid video');
  const body = parsed.data;
  const { file: [file] = [], thumbnail: [thumbnail] = [] } = uploadsOf(req);
  const externalUrl = body.externalUrl || null;

  if (!file && !externalUrl) throw badRequest('Upload a video file or paste a video link');
  if (file && externalUrl) throw badRequest('Use either an uploaded file or a link, not both');
  if (file && !file.buffer?.byteLength) throw badRequest('Video file is empty');

  const mediaKey = file ? (await putStreamVideo(body.title, file.buffer, file.mimetype)).key : null;
  const thumbnailKey = thumbnail?.buffer?.byteLength ? await putThumbnail('videos', auth.member.id, thumbnail) : null;

  const video = await prisma.video.create({
    data: {
      title: body.title,
      description: body.description,
      mediaKey,
      externalUrl: mediaKey ? null : externalUrl,
      thumbnailKey,
      published: body.published ?? true,
      authorId: auth.member.id,
    },
    include: { author: { select: authorSelect } },
  });
  return created(res, { video: serializeVideo(video) });
});

adminVideoRouter.patch('/:id', contentMediaFields, async (req, res) => {
  const existing = await prisma.video.findFirst({ where: { id: paramId(req), deletedAt: null } });
  if (!existing) throw notFound('Video not found');
  const auth = assertCanEdit(req, existing.authorId);
  const parsed = videoBody.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid video');
  const body = parsed.data;
  const { thumbnail: [thumbnail] = [] } = uploadsOf(req);

  // The media itself is immutable — replacing it means a new Bunny asset, so post a new video.
  if (body.externalUrl && existing.mediaKey) throw badRequest('This video was uploaded as a file. Delete it and add a new one to use a link.');

  const video = await prisma.video.update({
    where: { id: existing.id },
    data: {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.externalUrl === undefined ? {} : { externalUrl: body.externalUrl || null }),
      ...(body.published === undefined ? {} : { published: body.published }),
      ...(thumbnail?.buffer?.byteLength ? { thumbnailKey: await putThumbnail('videos', auth.member.id, thumbnail) } : {}),
    },
    include: { author: { select: authorSelect } },
  });
  return ok(res, { video: serializeVideo(video) });
});

adminVideoRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.video.findFirst({ where: { id: paramId(req), deletedAt: null } });
  if (!existing) throw notFound('Video not found');
  assertCanEdit(req, existing.authorId);
  await prisma.video.update({ where: { id: existing.id }, data: { deletedAt: new Date(), published: false } });
  return ok(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// Blogs
// ---------------------------------------------------------------------------

export const adminBlogRouter = Router();

adminBlogRouter.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid filter');
  const query = parsed.data;
  const where = listWhere(query);
  const [total, blogs] = await Promise.all([
    prisma.blog.count({ where }),
    prisma.blog.findMany({
      where,
      include: { author: { select: authorSelect } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return ok(res, { blogs: blogs.map(serializeBlog), total, page: query.page, limit: query.limit });
});

adminBlogRouter.post('/', contentMediaFields, async (req, res) => {
  const auth = asAdmin(req);
  const parsed = blogBody.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid blog');
  const body = parsed.data;
  const { thumbnail: [thumbnail] = [] } = uploadsOf(req);
  const externalUrl = body.externalUrl || null;

  if (!body.body && !externalUrl) throw badRequest('Write the blog text or paste a link to it');

  const thumbnailKey = thumbnail?.buffer?.byteLength ? await putThumbnail('blogs', auth.member.id, thumbnail) : null;

  const blog = await prisma.blog.create({
    data: {
      title: body.title,
      description: body.description,
      body: body.body,
      externalUrl,
      thumbnailKey,
      published: body.published ?? true,
      authorId: auth.member.id,
    },
    include: { author: { select: authorSelect } },
  });
  return created(res, { blog: serializeBlog(blog) });
});

adminBlogRouter.patch('/:id', contentMediaFields, async (req, res) => {
  const existing = await prisma.blog.findFirst({ where: { id: paramId(req), deletedAt: null } });
  if (!existing) throw notFound('Blog not found');
  const auth = assertCanEdit(req, existing.authorId);
  const parsed = blogBody.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid blog');
  const body = parsed.data;
  const { thumbnail: [thumbnail] = [] } = uploadsOf(req);

  const nextBody = body.body === undefined ? existing.body : body.body;
  const nextUrl = body.externalUrl === undefined ? existing.externalUrl : body.externalUrl || null;
  if (!nextBody && !nextUrl) throw badRequest('Write the blog text or paste a link to it');

  const blog = await prisma.blog.update({
    where: { id: existing.id },
    data: {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.body === undefined ? {} : { body: body.body }),
      ...(body.externalUrl === undefined ? {} : { externalUrl: body.externalUrl || null }),
      ...(body.published === undefined ? {} : { published: body.published }),
      ...(thumbnail?.buffer?.byteLength ? { thumbnailKey: await putThumbnail('blogs', auth.member.id, thumbnail) } : {}),
    },
    include: { author: { select: authorSelect } },
  });
  return ok(res, { blog: serializeBlog(blog) });
});

adminBlogRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.blog.findFirst({ where: { id: paramId(req), deletedAt: null } });
  if (!existing) throw notFound('Blog not found');
  assertCanEdit(req, existing.authorId);
  await prisma.blog.update({ where: { id: existing.id }, data: { deletedAt: new Date(), published: false } });
  return ok(res, { deleted: true });
});
