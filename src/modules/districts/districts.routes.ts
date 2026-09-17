import { Router } from 'express';
import { z } from 'zod';
import type { ActivityType, Prisma } from '@prisma/client';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

/** Activity kinds shown on the district health screen, in display order. */
const TRACKED_TYPES: ActivityType[] = ['MEETING', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING', 'ADD_MEMBER', 'OTHER'];
const VERIFIED_STATUSES = ['VERIFIED'] as const;
const REJECTED_STATUSES = ['NOT_VERIFIED'] as const;
const RECENT_LIMIT = 50;

const healthQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

function windowStart(days: number | undefined) {
  if (days) return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const districtsRouter = Router();
districtsRouter.use(requireAuth);

districtsRouter.get('/health', validate(healthQuery, 'query'), async (req, res) => {
  const auth = req as AuthedRequest;
  const districtId = auth.member.districtId;
  if (!districtId) throw forbidden('Your profile has no district yet');
  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: { id: true, name: true, nameHi: true },
  });
  if (!district) throw notFound('District not found');

  const days = req.query.days == null ? undefined : Number(req.query.days);
  const from = windowStart(days);
  // An activity counts for the district when either the member or the booth belongs to it.
  const where: Prisma.ActivityWhereInput = {
    deletedAt: null,
    occurredAt: { gte: from },
    OR: [{ actor: { districtId } }, { booth: { districtId } }],
  };

  const [byType, byStatus, total, memberCount, activeActors, recent] = await Promise.all([
    prisma.activity.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.activity.count({ where }),
    prisma.member.count({ where: { districtId, deletedAt: null } }),
    prisma.activity.findMany({ where, select: { actorId: true }, distinct: ['actorId'] }),
    prisma.activity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        status: true,
        occurredAt: true,
        attendeeCount: true,
        homesCovered: true,
        photoCount: true,
        actor: { select: { id: true, fullName: true, photoUrl: true } },
        booth: { select: { id: true, code: true, name: true, village: true } },
      },
    }),
  ]);

  const countOf = (type: ActivityType) => byType.find((row) => row.type === type)?._count._all ?? 0;
  const statusCount = (statuses: readonly string[]) =>
    byStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const percent = (part: number) => (total === 0 ? 0 : Math.round((part / total) * 1000) / 10);

  const verified = statusCount(VERIFIED_STATUSES);
  const rejected = statusCount(REJECTED_STATUSES);

  return ok(res, {
    district: { id: district.id, name: district.name, nameHi: district.nameHi },
    from: from.toISOString(),
    to: new Date().toISOString(),
    totals: {
      activities: total,
      verified,
      rejected,
      pending: total - verified - rejected,
      verifiedPercent: percent(verified),
      members: memberCount,
      activeMembers: activeActors.length,
      activeMemberPercent: memberCount === 0 ? 0 : Math.round((activeActors.length / memberCount) * 1000) / 10,
    },
    byType: TRACKED_TYPES.map((type) => {
      const count = countOf(type);
      return { type, count, percent: percent(count) };
    }).filter((row) => row.count > 0 || TRACKED_TYPES.indexOf(row.type) < 4),
    activities: recent.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      occurredAt: row.occurredAt.toISOString(),
      attendeeCount: row.attendeeCount,
      homesCovered: row.homesCovered,
      photoCount: row.photoCount,
      actorId: row.actor.id,
      actorName: row.actor.fullName,
      actorPhotoUrl: row.actor.photoUrl,
      boothCode: row.booth?.code ?? null,
      place: row.booth?.village ?? row.booth?.name ?? null,
    })),
  });
});
