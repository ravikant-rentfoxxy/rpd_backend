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
