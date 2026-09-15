import { existsSync, readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { logError } from './logger.js';
import { eventRankOf } from '../modules/events/event.rank.js';

const ACTIVITY_TITLE: Record<string, string> = {
  MEETING: 'Meeting',
  GRIHA_SAMPARK: 'Griha sampark',
  PUBLIC_PROGRAMME: 'Public programme',
  TRAINING: 'Training',
};

function activityTitle(type: string) {
  return ACTIVITY_TITLE[type] ?? 'Activity';
}

function formatWhen(at: Date) {
  return at
    .toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', ' ·');
}

function timePlaceBody(at: Date, place?: string | null) {
  const when = formatWhen(at);
  const venue = place?.trim();
  return venue ? `${when} · ${venue}` : when;
}

function messaging() {
  if (admin.apps.length) return admin.messaging();
  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!path || !existsSync(path)) return null;
  try {
    const cred = JSON.parse(readFileSync(path, 'utf8')) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin.messaging();
  } catch (error) {
    logError('firebase admin init failed', { error: String(error) });
    return null;
  }
}

async function sendToToken(token: string, title: string, body: string, data: Record<string, string>) {
  const fcm = messaging();
  if (!fcm) return;
  try {
    await fcm.send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    await prisma.member.updateMany({
      where: { fcmToken: token },
      data: { fcmTokenLastUsedAt: new Date() },
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      await prisma.member.updateMany({
        where: { fcmToken: token },
        data: { fcmToken: null, fcmTokenLastUsedAt: null },
      });
    }
    logError('fcm send failed', { error: String(error) });
  }
}

export function fcmTokenWrite(token: string) {
  return { fcmToken: token, fcmTokenLastUsedAt: new Date() };
}

export function fcmTokenClear() {
  return { fcmToken: null, fcmTokenLastUsedAt: null };
}

type Recipient = { id: string; fcmToken: string | null };

async function recipientsInArea(input: {
  includeId?: string;
  stateId?: string | null;
  districtId?: string | null;
  assemblyId?: string | null;
  hostRank?: number;
}): Promise<Recipient[]> {
  const where: {
    deletedAt: null;
    isLoggedIn: true;
    stateId?: string;
    districtId?: string;
    assemblyId?: string;
  } = {
    deletedAt: null,
    isLoggedIn: true,
  };
  if (input.assemblyId) where.assemblyId = input.assemblyId;
  else if (input.districtId) where.districtId = input.districtId;
  else if (input.stateId) where.stateId = input.stateId;

  const members = await prisma.member.findMany({
    where,
    select: {
      id: true,
      fcmToken: true,
      isSuperAdmin: true,
      posts: { where: { endedAt: null }, select: { post: true } },
    },
  });
  const minHostRank = input.hostRank ?? 1000;
  return members
    .filter((m) => {
      if (input.includeId && m.id === input.includeId) return true;
      if (m.isSuperAdmin) return true;
      const rank = Math.max(10, ...m.posts.map((p) => eventRankOf(p.post)));
      return minHostRank > rank;
    })
    .map((m) => ({ id: m.id, fcmToken: m.fcmToken?.trim() || null }));
}

async function deliver(input: {
  recipients: Recipient[];
  title: string;
  body: string;
  type: string;
  refId: string;
  data: Record<string, string>;
}) {
  const unique = new Map<string, Recipient>();
  for (const row of input.recipients) unique.set(row.id, row);
  const list = [...unique.values()];
  if (!list.length) return;

  await prisma.memberNotification.createMany({
    data: list.map((row) => ({
      memberId: row.id,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 500),
      type: input.type,
      refId: input.refId,
    })),
  });

  const tokens = list.map((row) => row.fcmToken).filter((token): token is string => Boolean(token));
  console.info(`[fcm] stored ${list.length} notification(s), sending "${input.title}" to ${tokens.length} token(s)`);
  for (const token of tokens) {
    await sendToToken(token, input.title, input.body, input.data);
  }
}

export function notifyEventCreated(input: {
  hostId: string;
  eventId: string;
  type: string;
  startsAt: Date;
  venue: string;
  stateId?: string | null;
  districtId?: string | null;
  assemblyId?: string | null;
  hostRank: number;
}) {
  void (async () => {
    const recipients = await recipientsInArea({
      includeId: input.hostId,
      stateId: input.stateId,
      districtId: input.districtId,
      assemblyId: input.assemblyId,
      hostRank: input.hostRank,
    });
    if (!recipients.length) {
      console.info('[fcm] no recipients for event', input.eventId);
      return;
    }
    await deliver({
      recipients,
      title: activityTitle(input.type),
      body: timePlaceBody(input.startsAt, input.venue),
      type: 'event',
      refId: input.eventId,
      data: { type: 'event', eventId: input.eventId },
    });
  })().catch((error) => {
    logError('event push failed', { error: String(error) });
  });
}

export function notifyActivityRecorded(input: {
  actorId: string;
  activityId: string;
  type: string;
  occurredAt: Date;
  place?: string | null;
  stateId?: string | null;
  districtId?: string | null;
  assemblyId?: string | null;
}) {
  if (!ACTIVITY_TITLE[input.type]) return;
  void (async () => {
    const recipients = await recipientsInArea({
      includeId: input.actorId,
      stateId: input.stateId,
      districtId: input.districtId,
      assemblyId: input.assemblyId,
    });
    if (!recipients.length) {
      console.info('[fcm] no recipients for activity', input.activityId);
      return;
    }
    await deliver({
      recipients,
      title: activityTitle(input.type),
      body: timePlaceBody(input.occurredAt, input.place),
      type: 'activity',
      refId: input.activityId,
      data: { type: 'activity', activityId: input.activityId },
    });
  })().catch((error) => {
    logError('activity push failed', { error: String(error) });
  });
}

export function notifyPostAssigned(input: {
  postId: string;
  issueLabel: string;
  assigneeId: string;
  assigneeName: string;
  authorId: string;
  assignerName: string;
}) {
  void (async () => {
    const issue = input.issueLabel.trim() || 'Grievance';
    const assigneeName = input.assigneeName.trim() || 'a member';
    const assignerName = input.assignerName.trim() || 'an officer';
    const members = await prisma.member.findMany({
      where: {
        deletedAt: null,
        id: { in: [...new Set([input.assigneeId, input.authorId].filter(Boolean))] },
      },
      select: { id: true, fcmToken: true },
    });
    const byId = new Map(members.map((row) => [row.id, row]));

    const assignee = byId.get(input.assigneeId);
    if (assignee) {
      await deliver({
        recipients: [{ id: assignee.id, fcmToken: assignee.fcmToken?.trim() || null }],
        title: 'Grievance assigned',
        body: `${issue} was assigned to you by ${assignerName}.`,
        type: 'post_assign',
        refId: input.postId,
        data: { type: 'post_assign', postId: input.postId },
      });
    }

    if (input.authorId && input.authorId !== input.assigneeId) {
      const author = byId.get(input.authorId);
      if (author) {
        await deliver({
          recipients: [{ id: author.id, fcmToken: author.fcmToken?.trim() || null }],
          title: 'Grievance update',
          body: `${issue} was assigned to ${assigneeName}.`,
          type: 'post_assign',
          refId: input.postId,
          data: { type: 'post_assign', postId: input.postId },
        });
      }
    }
  })().catch((error) => {
    logError('post assign push failed', { error: String(error) });
  });
}
