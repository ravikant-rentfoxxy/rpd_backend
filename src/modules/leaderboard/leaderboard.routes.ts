import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl } from '../../lib/storage.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

type Row = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  assemblyId: string | null;
  districtId: string | null;
  stateId: string | null;
  _count: { orgTaskStarts: number; assignedTasks: number; recruits: number };
};

function tasksOf(row: Row) {
  return row._count.orgTaskStarts + row._count.assignedTasks + row._count.recruits;
}

async function pointsByMember(ids: string[]) {
  const scores = new Map<string, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return scores;
  const entries = await prisma.pointLedgerEntry.findMany({
    where: { memberId: { in: ids }, pending: false },
    select: { memberId: true, direction: true, points: true },
  });
  for (const entry of entries) {
    const delta = entry.direction === 'CREDIT' ? entry.points : -entry.points;
    scores.set(entry.memberId, (scores.get(entry.memberId) ?? 0) + delta);
  }
  return scores;
}

function serializeBoard(
  rows: Row[],
  points: Map<string, number>,
  memberId: string,
  areaName: string | null,
  missing: boolean,
) {
  if (missing) {
    return { name: areaName, rank: null, total: 0, items: [] as ReturnType<typeof serializeRow>[] };
  }
  const ranked = [...rows].sort((a, b) => {
    const byTasks = tasksOf(b) - tasksOf(a);
    if (byTasks !== 0) return byTasks;
    const byPoints = (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0);
    if (byPoints !== 0) return byPoints;
    return a.fullName.localeCompare(b.fullName);
  });
  const index = ranked.findIndex((row) => row.id === memberId);
  const items = ranked.slice(0, 20).map((row, i) => serializeRow(row, points, i + 1, row.id === memberId));
  if (index >= 20) {
    items.push(serializeRow(ranked[index], points, index + 1, true));
  }
  return {
    name: areaName,
    rank: index >= 0 ? index + 1 : null,
    total: ranked.length,
    items,
  };
}

function serializeRow(row: Row, points: Map<string, number>, rank: number, isMe: boolean) {
  return {
    id: row.id,
    rank,
    fullName: row.fullName,
    photoUrl: row.photoUrl ? mediaPublicUrl(row.photoUrl) : null,
    tasksDone: tasksOf(row),
    points: points.get(row.id) ?? 0,
    isMe,
  };
}

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

leaderboardRouter.get('/', async (req, res) => {
  const auth = req as AuthedRequest;
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: auth.member.id },
    include: {
      assembly: { select: { name: true, districtId: true, district: { select: { name: true } } } },
      district: { select: { name: true } },
      state: { select: { name: true } },
    },
  });

  const select = {
    id: true,
    fullName: true,
    photoUrl: true,
    assemblyId: true,
    districtId: true,
    stateId: true,
    _count: {
      select: {
        orgTaskStarts: { where: { task: { deletedAt: null } } },
        assignedTasks: { where: { status: 'DONE' as const } },
        recruits: { where: { deletedAt: null } },
      },
    },
  };
  const active = {
    deletedAt: null,
    status: { in: ['DRAFT', 'PENDING', 'VERIFIED'] as const },
    fullName: { not: '' },
    stateId: { not: null },
    districtId: { not: null },
    assemblyId: { not: null },
  };
  const districtId = member.districtId ?? member.assembly?.districtId ?? null;
  const districtName = member.district?.name ?? member.assembly?.district?.name ?? null;

  const [assemblyRows, districtRows, stateRows] = await Promise.all([
    member.assemblyId
      ? prisma.member.findMany({
          where: { ...active, assemblyId: member.assemblyId },
          select,
        })
      : Promise.resolve([] as Row[]),
    districtId
      ? prisma.member.findMany({
          where: { ...active, districtId },
          select,
        })
      : Promise.resolve([] as Row[]),
    member.stateId
      ? prisma.member.findMany({
          where: { ...active, stateId: member.stateId },
          select,
        })
      : Promise.resolve([] as Row[]),
  ]);

  const ids = [...new Set([...assemblyRows, ...districtRows, ...stateRows].map((row) => row.id))];
  const points = await pointsByMember(ids);
  const meRow =
    assemblyRows.find((row) => row.id === member.id) ??
    districtRows.find((row) => row.id === member.id) ??
    stateRows.find((row) => row.id === member.id);

  return ok(res, {
    me: {
      id: member.id,
      fullName: member.fullName,
      photoUrl: member.photoUrl ? mediaPublicUrl(member.photoUrl) : null,
      tasksDone: meRow ? tasksOf(meRow) : 0,
      points: points.get(member.id) ?? 0,
    },
    boards: {
      assembly: serializeBoard(assemblyRows, points, member.id, member.assembly?.name ?? null, !member.assemblyId),
      district: serializeBoard(districtRows, points, member.id, districtName, !districtId),
      state: serializeBoard(stateRows, points, member.id, member.state?.name ?? null, !member.stateId),
    },
  });
});
