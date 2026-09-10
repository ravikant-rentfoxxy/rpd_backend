import { createHash, randomInt, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function hashSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashMobile(mobileE164: string): string {
  return hashSha256(mobileE164);
}

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}

export async function verifySecret(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function luhnCheckDigit(digits: string): string {
  let sum = 0;
  let alt = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}

export function signCardPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
