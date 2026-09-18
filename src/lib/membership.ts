import { logError } from './logger.js';
import { creditMemberAdded } from './points.js';
import { prisma } from './prisma.js';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Member ID: RPD-{STATE}-{row_id}. row_id is SERIAL and is never reused after delete. */
export function membershipNumberFromRowId(rowId: number, stateCode?: string | null): string {
  const code = (stateCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code) return `RPD-${code}-${rowId}`;
  return `RPD-${rowId}`;
}

export async function stateCodeForId(stateId?: string | null) {
  if (!stateId) return null;
  const state = await prisma.state.findUnique({ where: { id: stateId }, select: { code: true } });
  return state?.code ?? null;
}

export async function persistMembershipNumber(memberId: string, rowId: number, stateId?: string | null) {
  const number = membershipNumberFromRowId(rowId, await stateCodeForId(stateId));
  await prisma.member.update({
    where: { id: memberId },
    data: { membershipNumber: number },
  });
  await prisma.membershipCard.updateMany({
    where: { memberId },
    data: { publicCode: number },
  });
  return number;
}

/**
 * Finds the member a referral points to: a 10-digit mobile, or the invite code shown on their card.
 * Invite codes are derived (not stored), so codes are matched by recomputing them for active members.
 */
export async function findReferrer(input: string) {
  const value = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^\d{10,12}$/.test(value.replace(/^\+/, '')) && /^[6-9]\d{9}$/.test(digits.slice(-10))) {
    return prisma.member.findFirst({
      where: { mobileE164: `+91${digits.slice(-10)}`, deletedAt: null, status: { not: 'DRAFT' } },
      select: { id: true },
    });
  }
  if (!/^[A-Z0-9]{8}$/.test(value)) return null;
  const members = await prisma.member.findMany({
    where: { deletedAt: null, status: { not: 'DRAFT' } },
    select: { id: true, membershipNumber: true },
  });
  const match = members.find((m) => inviteCodeFrom(m.membershipNumber ?? m.id) === value);
  return match ? { id: match.id } : null;
}

/**
 * Credits the owner of a referral code when a member who hasn't joined yet enters it: they become the
 * recruiter (counts toward their tasks done / members added) and get the MEMBER_ADDED points.
 * The member entering the code gets nothing. Only the first referral counts, and a failure never blocks the caller.
 */
export async function applySignupReferral(
  member: { id: string; status: string; referralCode: string | null; recruitedById: string | null },
  input: string,
) {
  if (member.status !== 'DRAFT' || member.referralCode || member.recruitedById) return false;
  try {
    const referrer = await findReferrer(input);
    if (!referrer || referrer.id === member.id) return false;
    await prisma.member.update({
      where: { id: member.id },
      data: { referralCode: input.trim().toUpperCase(), recruitedById: referrer.id },
    });
    await creditMemberAdded(referrer.id, member.id);
    return true;
  } catch (error) {
    logError('signup referral failed', { error: error instanceof Error ? error.message : String(error), memberId: member.id });
    return false;
  }
}

/** Stable 8-character referral code (letters + digits), e.g. K7M2XQ9P */
export function inviteCodeFrom(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (Math.imul(hash, 31) + source.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += INVITE_ALPHABET[hash % INVITE_ALPHABET.length];
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
  }
  return code;
}
