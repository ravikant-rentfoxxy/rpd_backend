import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { haversineMetres, toNumber } from '../../lib/geo.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { serializeBooth } from '../members/member.serialize.js';

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const searchSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

type NearbyRow = {
  id: string;
  distance_metres: number;
};

export const boothsRouter = Router();
boothsRouter.use(requireAuth);

boothsRouter.get('/', async (req, res) => {
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : '';
  const assemblyId = typeof req.query.assemblyId === 'string' ? req.query.assemblyId : '';
  const booths = await prisma.booth.findMany({
    where: {
      deletedAt: null,
      ...(districtId ? { districtId } : {}),
      ...(assemblyId ? { assemblyId } : {}),
    },
    include: { mandal: true, assembly: true, district: true },
    orderBy: { boothNumber: 'asc' },
    take: 120,
  });
  return ok(res, { booths: booths.map((b) => serializeBooth(b)) });
});

async function nearestBooths(lat: number, lng: number, limit: number): Promise<NearbyRow[]> {
  const all = await prisma.booth.findMany({
    where: { deletedAt: null },
    select: { id: true, latitude: true, longitude: true },
  });
  return all
    .map((b) => ({
      id: b.id,
      distance_metres: haversineMetres(lat, lng, toNumber(b.latitude), toNumber(b.longitude)),
    }))
    .sort((a, b) => a.distance_metres - b.distance_metres)
    .slice(0, limit);
}

boothsRouter.get('/nearby', validate(nearbySchema, 'query'), async (req, res) => {
  const query = nearbySchema.parse(req.query);
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radiusKm = Math.min(query.radiusKm ?? env.NEARBY_DEFAULT_RADIUS_KM, env.NEARBY_MAX_RADIUS_KM);
  const limit = query.limit ?? env.NEARBY_LIMIT;
  const radiusMetres = radiusKm * 1000;

  const ranked = await nearestBooths(lat, lng, limit);

  const withinRadius = ranked.filter((r) => r.distance_metres <= radiusMetres);
  const chosen = withinRadius.length > 0 ? withinRadius : ranked;

  const booths = await prisma.booth.findMany({
    where: { id: { in: chosen.map((r) => r.id) } },
    include: { mandal: true, assembly: true, district: true },
  });
  const byId = new Map(booths.map((b) => [b.id, b]));
  const data = chosen
    .map((r) => {
      const booth = byId.get(r.id);
      return booth ? serializeBooth(booth, r.distance_metres) : null;
    })
    .filter(Boolean);

  return ok(res, {
    fetchedAt: new Date().toISOString(),
    lat,
    lng,
    radiusKm,
    usedFallbackNearest: withinRadius.length === 0,
    booths: data,
  });
});

boothsRouter.get('/search', validate(searchSchema, 'query'), async (req, res) => {
  const { q } = req.query as unknown as z.infer<typeof searchSchema>;
  const limit = (req.query as unknown as z.infer<typeof searchSchema>).limit ?? 20;
  const booths = await prisma.booth.findMany({
    where: {
      deletedAt: null,
      OR: [
        { village: { contains: q, mode: 'insensitive' } },
        { partNumber: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { boothNumber: { contains: q, mode: 'insensitive' } },
        { landmark: { contains: q, mode: 'insensitive' } },
        { pincode: { contains: q } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    include: { mandal: true, assembly: true, district: true },
    take: limit,
    orderBy: { boothNumber: 'asc' },
  });
  return ok(res, { booths: booths.map((b) => serializeBooth(b)) });
});

boothsRouter.get('/:id', async (req, res) => {
  const booth = await prisma.booth.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { mandal: true, assembly: true, district: true },
  });
  if (!booth) throw notFound('Booth not found');
  return ok(res, { booth: serializeBooth(booth) });
});

boothsRouter.get('/:id/health', async (req, res) => {
  const booth = await prisma.booth.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { mandal: true, assembly: true, district: true, healthComponents: true },
  });
  if (!booth) throw notFound('Booth not found');
  const weakest = [...booth.healthComponents].sort(
    (a, b) => a.score / a.maxScore - b.score / b.maxScore,
  )[0];
  return ok(res, {
    booth: serializeBooth(booth),
    score: booth.healthScore,
    band: booth.healthBand,
    components: booth.healthComponents,
    primaryAction: weakest
      ? { key: weakest.key, label: `Fix: ${weakest.label}` }
      : { key: 'none', label: 'Keep going' },
  });
});
