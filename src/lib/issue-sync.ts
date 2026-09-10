import { prisma } from './prisma.js';

const SYNC_ID = 1;

export async function issueSyncTimestamp() {
  const row = await prisma.postIssueSync.upsert({
    where: { id: SYNC_ID },
    update: {},
    create: { id: SYNC_ID, updatedAt: new Date() },
  });
  return row.updatedAt.toISOString();
}

export async function bumpIssueSync() {
  const now = new Date();
  await prisma.postIssueSync.upsert({
    where: { id: SYNC_ID },
    update: { updatedAt: now },
    create: { id: SYNC_ID, updatedAt: now },
  });
}
