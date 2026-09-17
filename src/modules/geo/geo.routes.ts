import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { geocodeAddress, searchPlaces } from '../../lib/geocode.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { lookupPincodeState } from './pincode.js';

const geocodeQuery = z.object({
  q: z.string().trim().min(2).max(300),
});

const PLACES_MAX_LIMIT = 10;

const placesQuery = z.object({
  q: z.string().trim().min(3).max(300),
  limit: z.coerce.number().int().min(1).max(PLACES_MAX_LIMIT).optional(),
});

export const geoRouter = Router();
geoRouter.use(requireAuth);

geoRouter.get('/geocode', validate(geocodeQuery, 'query'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const hit = await geocodeAddress(q);
  if (!hit) throw notFound('Location not found');
  return ok(res, { query: q, ...hit });
});

// Type-ahead suggestions for address boxes. Never returns more than 10 rows.
geoRouter.get('/places', validate(placesQuery, 'query'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit ?? PLACES_MAX_LIMIT) || PLACES_MAX_LIMIT, PLACES_MAX_LIMIT);
  const places = await searchPlaces(q, limit);
  return ok(res, { query: q, places });
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
