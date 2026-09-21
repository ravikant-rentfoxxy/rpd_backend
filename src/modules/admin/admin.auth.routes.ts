import { Router } from 'express';
import type { PostType } from '@prisma/client';
import { z } from 'zod';
import { env, isProd } from '../../config/env.js';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { generateOtp, hashSecret, verifySecret } from '../../lib/crypto.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { badRequest, forbidden, tooMany, unauthorized } from '../../lib/errors.js';
import { sendOtpWhatsApp } from '../../lib/whatsapp.js';
import { actorRank, POST_RANK, primaryPost } from './admin.posts.js';
import { serializeAdminMember } from './admin.serialize.js';

const mobileSchema = z.object({
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  channel: z.literal('WHATSAPP').default('WHATSAPP'),
});

const verifySchema = z.object({
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/),
  code: z.string().trim().regex(/^\d{6}$/),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const SESSION_DAYS = 90;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

async function issueAdminTokens(
  memberId: string,
  post: Parameters<typeof signAccessToken>[0]['post'],
  boothId: string | null,
  req: { get: (name: string) => string | undefined; ip?: string },
) {
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const refreshRow = await prisma.refreshToken.create({
    data: {
      memberId,
      tokenHash: await hashSecret('pending'),
      expiresAt,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    },
  });
  const refreshToken = signRefreshToken(memberId, refreshRow.id);
  await prisma.refreshToken.update({
    where: { id: refreshRow.id },
    data: { tokenHash: await hashSecret(refreshToken) },
  });
  return {
    accessToken: signAccessToken({ sub: memberId, post, boothId }),
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: SESSION_SECONDS,
    expiresAt: expiresAt.toISOString(),
  };
}

function assertOfficer(member: { isSuperAdmin: boolean; status: string }, posts: { post: PostType; endedAt: Date | null }[]) {
  const rank = actorRank(member, posts);
  if (!member.isSuperAdmin && member.status !== 'VERIFIED') {
    throw forbidden('Verify your membership before opening the admin portal');
  }
  if (!member.isSuperAdmin && rank <= POST_RANK.MEMBER) {
    throw forbidden('This portal is for office bearers');
  }
  return rank;
}

export const adminAuthRouter = Router();

adminAuthRouter.post('/otp/request', async (req, res) => {
  const { mobile, channel } = mobileSchema.parse(req.body);
  const mobileE164 = `+91${mobile}`;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.otpChallenge.count({
    where: { mobileE164, createdAt: { gte: hourAgo } },
  });
  if (recent >= 5) throw tooMany('5 attempts per number per hour. Try later.');
  const last = await prisma.otpChallenge.findFirst({
    where: { mobileE164, purpose: 'SIGN_IN' },
    orderBy: { createdAt: 'desc' },
  });
  if (last && Date.now() - last.createdAt.getTime() < env.OTP_RESEND_SECONDS * 1000) {
    throw tooMany(`Resend in ${env.OTP_RESEND_SECONDS} seconds`);
  }
  const member = await prisma.member.findUnique({
    where: { mobileE164 },
    include: { posts: { where: { endedAt: null } } },
  });
  if (!member) throw forbidden('This portal is for office bearers');
  assertOfficer(member, member.posts);
  const code = isProd ? generateOtp() : env.OTP_DEV_CODE;
  const challenge = await prisma.otpChallenge.create({
    data: {
      memberId: member.id,
      mobileE164,
      codeHash: await hashSecret(code),
      channel,
      purpose: 'SIGN_IN',
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    },
  });
  if (!isProd) console.info(`[admin-otp] ${mobileE164} → ${code}`);
  try {
    await sendOtpWhatsApp(mobileE164, code);
  } catch (error) {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw error;
  }
  return created(res, {
    challengeId: challenge.id,
    channel,
    expiresIn: env.OTP_TTL_SECONDS,
    resendIn: env.OTP_RESEND_SECONDS,
  });
});

adminAuthRouter.post('/otp/verify', async (req, res) => {
  const { mobile, code } = verifySchema.parse(req.body);
  const mobileE164 = `+91${mobile}`;
  const challenge = await prisma.otpChallenge.findFirst({
    where: { mobileE164, purpose: 'SIGN_IN', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw badRequest('Request a new code');
  if (challenge.lockedUntil && challenge.lockedUntil > new Date()) throw tooMany('This number is locked. Try later.');
  if (challenge.expiresAt < new Date()) throw badRequest('Code expired');
  const match = await verifySecret(code, challenge.codeHash);
  if (!match) {
    const attempts = challenge.attempts + 1;
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts,
        lockedUntil: attempts >= challenge.maxAttempts ? new Date(Date.now() + 60 * 60 * 1000) : null,
      },
    });
    throw badRequest('Wrong code');
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  const member = await prisma.member.findUnique({
    where: { mobileE164 },
    include: { posts: { where: { endedAt: null }, orderBy: { startedAt: 'desc' } }, state: true, district: true, assembly: true, booth: true },
  });
  if (!member) throw forbidden('This portal is for office bearers');
  const rank = assertOfficer(member, member.posts);
  const post = primaryPost(member, member.posts);
  const tokens = await issueAdminTokens(member.id, post === 'SUPER_ADMIN' ? 'MEMBER' : post, member.boothId, req);
  return ok(res, {
    tokens,
    rank,
    post,
    member: serializeAdminMember(member),
  });
});

adminAuthRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  let claims: { sub: string; jti: string };
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Session expired');
  }
  const row = await prisma.refreshToken.findUnique({ where: { id: claims.jti } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) throw unauthorized('Session expired');
  const valid = await verifySecret(refreshToken, row.tokenHash);
  if (!valid) throw unauthorized('Session expired');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: row.memberId },
    include: { posts: { where: { endedAt: null } } },
  });
  assertOfficer(member, member.posts);
  const post = primaryPost(member, member.posts);
  const tokens = await issueAdminTokens(member.id, post === 'SUPER_ADMIN' ? 'MEMBER' : post, member.boothId, req);
  return ok(res, { tokens, post });
});
