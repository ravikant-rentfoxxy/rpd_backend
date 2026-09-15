import { Router } from 'express';
import { ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl } from '../../lib/storage.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import {
  leaderboardActiveWhere,
  leaderboardMemberSelect,
  localLeaderboardSnapshot,
  pointsByMember,
  serializeBoard,
  tasksOf,
  type LeaderboardRow,
} from './leaderboard.shared.js';

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

  const districtId = member.districtId ?? member.assembly?.districtId ?? null;
  const districtName = member.district?.name ?? member.assembly?.district?.name ?? null;

  const [assemblyRows, districtRows, stateRows] = await Promise.all([
    member.assemblyId
      ? prisma.member.findMany({
          where: { ...leaderboardActiveWhere, assemblyId: member.assemblyId },
          select: leaderboardMemberSelect,
        })
      : Promise.resolve([] as LeaderboardRow[]),
    districtId
      ? prisma.member.findMany({
          where: { ...leaderboardActiveWhere, districtId },
          select: leaderboardMemberSelect,
        })
      : Promise.resolve([] as LeaderboardRow[]),
    member.stateId
      ? prisma.member.findMany({
          where: { ...leaderboardActiveWhere, stateId: member.stateId },
          select: leaderboardMemberSelect,
        })
      : Promise.resolve([] as LeaderboardRow[]),
  ]);

  const rows = {
    assembly: assemblyRows as LeaderboardRow[],
    district: districtRows as LeaderboardRow[],
    state: stateRows as LeaderboardRow[],
  };
  const ids = [...new Set([...rows.assembly, ...rows.district, ...rows.state].map((row) => row.id))];
  const points = await pointsByMember(ids);
  const meRow =
    rows.assembly.find((row) => row.id === member.id) ??
    rows.district.find((row) => row.id === member.id) ??
    rows.state.find((row) => row.id === member.id);

  return ok(res, {
    me: {
      id: member.id,
      fullName: member.fullName,
      photoUrl: member.photoUrl ? mediaPublicUrl(member.photoUrl) : null,
      tasksDone: meRow ? tasksOf(meRow) : 0,
      points: points.get(member.id) ?? 0,
    },
    boards: {
      assembly: serializeBoard(rows.assembly, points, member.id, member.assembly?.name ?? null, !member.assemblyId),
      district: serializeBoard(rows.district, points, member.id, districtName, !districtId),
      state: serializeBoard(rows.state, points, member.id, member.state?.name ?? null, !member.stateId),
    },
    local: await localLeaderboardSnapshot(member),
  });
});
