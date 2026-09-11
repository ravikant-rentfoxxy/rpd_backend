import { Buffer } from 'node:buffer';
import https from 'node:https';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

const STREAM_PREFIX = 'stream/';
const STREAM_API = 'https://video.bunnycdn.com';

type StreamVideo = {
  guid?: string;
  status?: number;
  encodeProgress?: number;
  storageSize?: number;
  length?: number;
  width?: number;
  height?: number;
};

type StreamStatus = {
  success?: boolean;
  message?: string;
  statusCode?: number;
};

function storageOrigin() {
  return `https://${env.BUNNY_STORAGE_HOSTNAME.replace(/^https?:\/\//, '')}`;
}

function storageCdn() {
  return `https://${env.BUNNY_STORAGE_CDN_HOSTNAME.replace(/^https?:\/\//, '')}`;
}

function streamCdn() {
  return `https://${env.BUNNY_STREAM_CDN_HOSTNAME.replace(/^https?:\/\//, '')}`;
}

export function streamVideoId(key?: string | null) {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return null;
  if (key.startsWith(STREAM_PREFIX)) return key.slice(STREAM_PREFIX.length).split('/')[0] || null;
  return null;
}

export function mediaPublicUrl(key: string) {
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  const videoId = streamVideoId(key);
  if (videoId) return `${streamCdn()}/${videoId}/playlist.m3u8`;
  return `${storageCdn()}/${key.replace(/^\/+/, '')}`;
}

export function streamThumbnailUrl(videoId: string) {
  return `${streamCdn()}/${videoId}/thumbnail.jpg`;
}

async function bunnyError(res: Response, label: string): Promise<never> {
  const body = await res.text().catch(() => '');
  throw new AppError(502, 'storage_error', `${label} failed (${res.status})`, body || res.statusText);
}

export async function putStorageObject(key: string, body: Buffer, contentType: string) {
  const path = key.replace(/^\/+/, '');
  const res = await fetch(`${storageOrigin()}/${env.BUNNY_STORAGE_ZONE}/${path}`, {
    method: 'PUT',
    headers: {
      AccessKey: env.BUNNY_STORAGE_API_KEY,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) await bunnyError(res, 'Bunny Storage upload');
  return mediaPublicUrl(path);
}

export async function putMemberPhoto(key: string, body: Buffer, contentType: string) {
  return putStorageObject(key, body, contentType);
}

function streamHeaders(extra?: Record<string, string>) {
  return {
    AccessKey: env.BUNNY_STREAM_API_KEY,
    Accept: 'application/json',
    ...extra,
  };
}

function streamVideoUrl(videoId?: string) {
  const base = `${STREAM_API}/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos`;
  return videoId ? `${base}/${videoId}` : base;
}

function exactBytes(body: Buffer) {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  return bytes;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}

function putStreamBinary(videoId: string, body: Uint8Array) {
  const url = new URL(streamVideoUrl(videoId));
  return new Promise<{ status: number; body: StreamStatus }>((resolve, reject) => {
    const req = https.request(
      {
        method: 'PUT',
        hostname: url.hostname,
        path: url.pathname,
        headers: streamHeaders({
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(body.byteLength),
        }),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: StreamStatus = {};
          try {
            parsed = text ? (JSON.parse(text) as StreamStatus) : {};
          } catch {
            parsed = { message: text };
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function deleteStreamVideo(videoId: string) {
  await fetch(streamVideoUrl(videoId), { method: 'DELETE', headers: streamHeaders() }).catch(() => undefined);
}

export async function putStreamVideo(title: string, body: Buffer, _contentType?: string) {
  if (!body.byteLength) throw new AppError(400, 'storage_error', 'Video file is empty');

  const create = await fetch(streamVideoUrl(), {
    method: 'POST',
    headers: streamHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  });
  if (!create.ok) await bunnyError(create, 'Bunny Stream create');
  const created = await readJson<StreamVideo>(create);
  const videoId = created.guid?.trim();
  if (!videoId) throw new AppError(502, 'storage_error', 'Bunny Stream did not return a video id');

  const bytes = exactBytes(body);
  const upload = await putStreamBinary(videoId, bytes);
  if (upload.status >= 400 || upload.body.success === false) {
    await deleteStreamVideo(videoId);
    throw new AppError(
      502,
      'storage_error',
      `Bunny Stream upload failed (${upload.status})`,
      upload.body.message || 'Upload rejected',
    );
  }

  const key = `${STREAM_PREFIX}${videoId}`;
  return { key, videoId, url: mediaPublicUrl(key), thumbnailUrl: streamThumbnailUrl(videoId) };
}

export async function ensureStorage() {
  const res = await fetch(`${storageOrigin()}/${env.BUNNY_STORAGE_ZONE}/`, {
    method: 'GET',
    headers: { AccessKey: env.BUNNY_STORAGE_API_KEY, Accept: 'application/json' },
  });
  if (!res.ok && res.status !== 404) await bunnyError(res, 'Bunny Storage check');
}
