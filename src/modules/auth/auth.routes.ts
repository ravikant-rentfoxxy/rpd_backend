import { Router } from 'express';
import { z } from 'zod';
import { env, isProd } from '../../config/env.js';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { generateOtp, hashMobile, hashSecret, verifySecret } from '../../lib/crypto.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { badRequest, tooMany, unauthorized } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { serializeMember } from '../members/member.serialize.js';
import { membershipNumberFromRowId } from '../../lib/membership.js';
import { primaryPost } from '../admin/admin.posts.js';
import { touchLastActive } from '../home/last-active.js';
import { fcmTokenClear, fcmTokenWrite } from '../../lib/push.js';

const mobileSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  channel: z.enum(['WHATSAPP', 'SMS']).default('WHATSAPP'),
});

const verifySchema = z.object({
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/),
  code: z.string().trim().regex(/^\d{6}$/),
  fcmToken: z.string().trim().min(20).max(512).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

function toE164(mobile: string) {
  return `+91${mobile}`;
}

const SESSION_DAYS = 90;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function verificationOf(status: string, isSuperAdmin = false) {
  return {
    verified: status === 'VERIFIED' || isSuperAdmin,
    verifyStatus: status,
  };
}

async function issueTokens(memberId: string, post: Parameters<typeof signAccessToken>[0]['post'], boothId: string | null, req: { get: (n: string) => string | undefined; ip?: string }) {
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

export const authRouter = Router();

authRouter.post('/otp/request', validate(mobileSchema), async (req, res) => {
  const { mobile, channel } = req.body as z.infer<typeof mobileSchema>;
  const mobileE164 = toE164(mobile);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.otpChallenge.count({
    where: { mobileE164, createdAt: { gte: hourAgo } },
  });
  if (recent >= 5) {
    throw tooMany('5 attempts per number per hour. Try later.');
  }

  const last = await prisma.otpChallenge.findFirst({
    where: { mobileE164, purpose: 'SIGN_IN' },
    orderBy: { createdAt: 'desc' },
  });
  if (last && Date.now() - last.createdAt.getTime() < env.OTP_RESEND_SECONDS * 1000) {
    throw tooMany(`Resend in ${env.OTP_RESEND_SECONDS} seconds`);
  }

  const member = await prisma.member.findUnique({ where: { mobileE164 } });
  const code = isProd ? generateOtp() : env.OTP_DEV_CODE;
  const challenge = await prisma.otpChallenge.create({
    data: {
      memberId: member?.id,
      mobileE164,
      codeHash: await hashSecret(code),
      channel,
      purpose: 'SIGN_IN',
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    },
  });

  if (!isProd) {
    console.info(`[otp] ${mobileE164} → ${code}`);
  }

  return created(res, {
    challengeId: challenge.id,
    channel,
    expiresIn: env.OTP_TTL_SECONDS,
    resendIn: env.OTP_RESEND_SECONDS,
    isNewMember: !member,
  });
});

authRouter.post('/otp/verify', validate(verifySchema), async (req, res) => {
  const { mobile, code, fcmToken } = req.body as z.infer<typeof verifySchema>;
  const mobileE164 = toE164(mobile);

  const challenge = await prisma.otpChallenge.findFirst({
    where: { mobileE164, purpose: 'SIGN_IN', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw badRequest('Request a new code');
  if (challenge.lockedUntil && challenge.lockedUntil > new Date()) {
    throw tooMany('This number is locked. Try later.');
  }
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

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  let member = await prisma.member.findUnique({
    where: { mobileE164 },
    include: { posts: { where: { endedAt: null }, orderBy: { startedAt: 'desc' } }, booth: true },
  });

  if (!member) {
    member = await prisma.member.create({
      data: {
        mobileE164,
        mobileHash: hashMobile(mobileE164),
        fullName: '',
        status: 'DRAFT',
      },
      include: { posts: true, booth: true },
    });
  }
  if (!member.membershipNumber) {
    member = await prisma.member.update({
      where: { id: member.id },
      data: { membershipNumber: membershipNumberFromRowId(member.rowId) },
      include: { posts: { where: { endedAt: null }, orderBy: { startedAt: 'desc' } }, booth: true },
    });
  }

  member = await prisma.member.update({
    where: { id: member.id },
    data: {
      isLoggedIn: true,
      lastLoginAt: new Date(),
      ...(fcmToken ? fcmTokenWrite(fcmToken) : {}),
    },
    include: { posts: { where: { endedAt: null }, orderBy: { startedAt: 'desc' } }, booth: true },
  });

  const post = primaryPost(member, member.posts);
  const tokens = await issueTokens(member.id, post, member.boothId, req);
  const serialized = serializeMember(member);
  const verification = verificationOf(member.status, member.isSuperAdmin);

  return ok(res, {
    tokens,
    post: serialized.post,
    ...verification,
    isNewMember: !member.isSuperAdmin && (member.status === 'DRAFT' || !member.fullName),
    member: serialized,
  });
});

authRouter.post('/refresh', validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
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
  const post = primaryPost(member, member.posts);
  const tokens = await issueTokens(member.id, post, member.boothId, req);
  return ok(res, { tokens, post, ...verificationOf(member.status, member.isSuperAdmin) });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const { member } = req as AuthedRequest;
  await prisma.member.update({
    where: { id: member.id },
    data: { ...fcmTokenClear(), isLoggedIn: false },
  });
  await prisma.refreshToken.updateMany({
    where: { memberId: member.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return ok(res, { loggedOut: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { member } = req as AuthedRequest;
  await touchLastActive(member.id);
  const full = await prisma.member.findUniqueOrThrow({
    where: { id: member.id },
    include: {
      booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } },
      state: true,
      district: true,
      assembly: true,
      posts: { where: { endedAt: null } },
      card: true,
    },
  });
  const serialized = serializeMember(full);
  return ok(res, {
    member: serialized,
    post: serialized.post,
    ...verificationOf(full.status, full.isSuperAdmin),
  });
});
