const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function membershipNumberFromRowId(rowId: number): string {
  return `RPD-${rowId}`;
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
