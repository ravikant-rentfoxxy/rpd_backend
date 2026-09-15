import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { lookupPincodeState } from './pincode.js';

const geocodeQuery = z.object({
  q: z.string().trim().min(2).max(300),
});

const FILLER_RE = /\b(village|gram|gaon|block|tehsil|tahsil|district|post|ps|thana|panchayat)\b/gi;

function isFillerWord(word: string) {
  return /^(village|gram|gaon|block|tehsil|tahsil|district|post|ps|thana|panchayat)$/i.test(word);
}

function geocodeVariants(q: string) {
  const cleaned = q.replace(/\s+/g, ' ').trim();
  const variants = [cleaned];
  const stripped = cleaned.replace(FILLER_RE, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  if (stripped && stripped !== cleaned) variants.push(stripped);

  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const firstWord = parts[0].split(/\s+/).find((word) => word && !isFillerWord(word)) ?? parts[0].split(/\s+/)[0];
    if (firstWord) {
      variants.push(`${firstWord}, ${parts.slice(1).join(', ')}`);
      variants.push(`${firstWord}, ${parts[parts.length - 1]}`);
    }
  }

  return [...new Set(variants)].filter((value) => value.length >= 2).slice(0, 4);
}

async function nominatimSearch(q: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'in');
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RPD-App/1.0 (ravi@rentfoxxy.com)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw badRequest('Could not verify this address');
  const payload: unknown = await response.json();
  const first = Array.isArray(payload) ? payload[0] : undefined;
  const row = first as { display_name?: string; lat?: string; lon?: string } | undefined;
  const latitude = row?.lat == null ? Number.NaN : Number(row.lat);
  const longitude = row?.lon == null ? Number.NaN : Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    displayName: row?.display_name ?? q,
    latitude,
    longitude,
  };
}

export const geoRouter = Router();
geoRouter.use(requireAuth);

geoRouter.get('/geocode', validate(geocodeQuery, 'query'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const variants = geocodeVariants(q);

  try {
    for (const [index, variant] of variants.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      const hit = await nominatimSearch(variant);
      if (hit) {
        return ok(res, { query: q, matchedQuery: variant, ...hit });
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest('Could not verify this address');
  }

  throw notFound('Location not found');
});

geoRouter.get('/pincode/:pincode', async (req, res) => {
  const hit = await lookupPincodeState(String(req.params.pincode ?? ''));
  return ok(res, hit);
});

geoRouter.get('/hierarchy', async (_req, res) => {
  const levels = await prisma.orgLevel.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { posts: { orderBy: { title: 'asc' } } },
  });
  return ok(res, {
    levels: levels.map((level) => ({
      id: level.id,
      code: level.code,
      name: level.name,
      nameHi: level.nameHi,
      sortOrder: level.sortOrder,
      posts: level.posts.map((post) => ({
        id: post.id,
        post: post.post,
        title: post.title,
        titleHi: post.titleHi,
      })),
    })),
  });
});

const UNION_TERRITORY_CODES = ['AN', 'CH', 'DH', 'JK', 'LA', 'LD', 'DL', 'PY'];

geoRouter.get('/states', async (_req, res) => {
  const states = await prisma.state.findMany({
    where: { code: { notIn: UNION_TERRITORY_CODES } },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, nameHi: true },
  });
  return ok(res, { states });
});

geoRouter.get('/regions', async (req, res) => {
  const stateId = typeof req.query.stateId === 'string' ? req.query.stateId : '';
  const regions = await prisma.region.findMany({
    where: stateId ? { stateId } : undefined,
    orderBy: { name: 'asc' },
    select: { id: true, stateId: true, code: true, name: true, nameHi: true },
  });
  return ok(res, { regions });
});

geoRouter.get('/districts', async (req, res) => {
  const stateId = typeof req.query.stateId === 'string' ? req.query.stateId : '';
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : '';
  const districts = await prisma.district.findMany({
    where: {
      ...(stateId ? { stateId } : {}),
      ...(regionId ? { regionId } : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      stateId: true,
      regionId: true,
      code: true,
      name: true,
      nameHi: true,
      state: { select: { name: true, nameHi: true } },
    },
  });
  return ok(res, {
    districts: districts.map((district) => ({
      id: district.id,
      stateId: district.stateId,
      regionId: district.regionId,
      code: district.code,
      name: district.name,
      nameHi: district.nameHi,
      stateName: district.state.name,
      stateNameHi: district.state.nameHi,
    })),
  });
});

geoRouter.get('/constituencies', async (req, res) => {
  const stateId = typeof req.query.stateId === 'string' ? req.query.stateId : '';
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : '';
  const constituencies = await prisma.assemblyConstituency.findMany({
    where: {
      ...(stateId ? { stateId } : {}),
      ...(districtId ? { districtId } : {}),
    },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    select: { id: true, stateId: true, districtId: true, code: true, number: true, name: true, nameHi: true },
  });
  return ok(res, { constituencies });
});

geoRouter.get('/assemblies', async (req, res) => {
  const stateId = typeof req.query.stateId === 'string' ? req.query.stateId : '';
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : '';
  const assemblies = await prisma.assemblyConstituency.findMany({
    where: {
      ...(stateId ? { stateId } : {}),
      ...(districtId ? { districtId } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, stateId: true, districtId: true, code: true, number: true, name: true, nameHi: true },
  });
  return ok(res, { assemblies });
});

geoRouter.get('/mandals', async (req, res) => {
  const assemblyId = typeof req.query.assemblyId === 'string' ? req.query.assemblyId : '';
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : '';
  const mandals = await prisma.mandal.findMany({
    where: {
      ...(assemblyId ? { assemblyId } : {}),
      ...(districtId ? { districtId } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, districtId: true, assemblyId: true, code: true, name: true, nameHi: true },
  });
  return ok(res, { mandals });
});
