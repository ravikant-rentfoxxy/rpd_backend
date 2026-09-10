import { prisma } from '../../lib/prisma.js';

export async function touchLastActive(memberId: string) {
  const now = new Date();
  await prisma.member.update({
    where: { id: memberId },
    data: { lastActiveAt: now },
  });
  return now;
}
