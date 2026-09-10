import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';

export const geoRouter = Router();
geoRouter.use(requireAuth);

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
    select: { id: true, stateId: true, regionId: true, code: true, name: true, nameHi: true },
  });
  return ok(res, { districts });
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
