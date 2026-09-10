import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { PostType } from '@prisma/client';

export type AccessClaims = {
  sub: string;
  post: PostType;
  boothId: string | null;
};

export function signAccessToken(claims: AccessClaims): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(memberId: string, tokenId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'] };
  return jwt.sign({ sub: memberId, jti: tokenId }, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; jti: string };
}
