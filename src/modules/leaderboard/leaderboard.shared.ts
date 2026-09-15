import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl } from '../../lib/storage.js';

export type LeaderboardRow = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  assemblyId: string | null;
  districtId: string | null;
  stateId: string | null;
  _count: { orgTaskStarts: number; assignedTasks: number; recruits: number };
};

export const leaderboardMemberSelect = {
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

export const leaderboardActiveWhere = {
  deletedAt: null,
  status: { in: ['DRAFT', 'PENDING', 'VERIFIED'] as Array<'DRAFT' | 'PENDING' | 'VERIFIED'> },
  fullName: { not: '' },
  stateId: { not: null },
  districtId: { not: null },
  assemblyId: { not: null },
};

export function tasksOf(row: LeaderboardRow) {
  return row._count.orgTaskStarts + row._count.assignedTasks + row._count.recruits;
}

export async function pointsByMember(ids: string[]) {
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

export function serializeBoard(
  rows: LeaderboardRow[],
  points: Map<string, number>,
  memberId: string,
  areaName: string | null,
  missing: boolean,
) {
  if (missing) {
    return { name: areaName, rank: null as number | null, total: 0, items: [] as ReturnType<typeof serializeRow>[] };
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
    const me = ranked[index];
    if (me) items.push(serializeRow(me, points, index + 1, true));
  }
  return {
    name: areaName,
    rank: index >= 0 ? index + 1 : null,
    total: ranked.length,
    items,
  };
}

function serializeRow(row: LeaderboardRow, points: Map<string, number>, rank: number, isMe: boolean) {
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

/** Same peer group as the leaderboard AC tab (falls back to district, then state). */
export async function localLeaderboardSnapshot(member: {
  id: string;
  assemblyId: string | null;
  districtId: string | null;
  stateId: string | null;
  assembly?: { name: string | null; districtId: string | null; district?: { name: string | null } | null } | null;
  district?: { name: string | null } | null;
  state?: { name: string | null } | null;
}) {
  const districtId = member.districtId ?? member.assembly?.districtId ?? null;
  const scopes = [
    {
      key: 'assembly' as const,
      missing: !member.assemblyId,
      name: member.assembly?.name ?? null,
      where: { ...leaderboardActiveWhere, assemblyId: member.assemblyId! },
    },
    {
      key: 'district' as const,
      missing: !districtId,
      name: member.district?.name ?? member.assembly?.district?.name ?? null,
      where: { ...leaderboardActiveWhere, districtId: districtId! },
    },
    {
      key: 'state' as const,
      missing: !member.stateId,
      name: member.state?.name ?? null,
      where: { ...leaderboardActiveWhere, stateId: member.stateId! },
    },
  ];
  const scope = scopes.find((s) => !s.missing) ?? scopes[scopes.length - 1]!;
  if (scope.missing) {
    return { scope: scope.key, name: scope.name, rank: 1, total: 1 };
  }
  const rows = (await prisma.member.findMany({
    where: scope.where,
    select: leaderboardMemberSelect,
  })) as unknown as LeaderboardRow[];
  const points = await pointsByMember(rows.map((row) => row.id));
  const board = serializeBoard(rows, points, member.id, scope.name, false);
  return {
    scope: scope.key,
    name: board.name,
    rank: board.rank ?? 1,
    total: Math.max(board.total, 1),
  };
}
