import { prisma } from './prisma.js';

/** Credits the recruiter the MEMBER_ADDED points once per recruit; returns the points awarded (0 if already credited). */
export async function creditMemberAdded(recruiterId: string, recruitId: string) {
  const note = `Member added · ${recruitId}`;
  const existing = await prisma.pointLedgerEntry.findFirst({
    where: { memberId: recruiterId, source: 'MEMBER_ADDED', note },
  });
  if (existing) return 0;
  const rule = await prisma.pointRule.upsert({
    where: { source: 'MEMBER_ADDED' },
    update: {},
    create: { source: 'MEMBER_ADDED', points: 1, unitLabel: 'member', active: true },
  });
  const points = rule.active ? rule.points : 1;
  if (points <= 0) return 0;
  const now = new Date();
  await prisma.pointLedgerEntry.create({
    data: {
      memberId: recruiterId,
      source: 'MEMBER_ADDED',
      direction: 'CREDIT',
      points,
      pending: false,
      note,
      periodMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    },
  });
  return points;
}
