import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken, type AccessClaims } from '../lib/jwt.js';
import type { Member, PostType } from '@prisma/client';

export type AuthedRequest = Request & {
  auth: AccessClaims;
  member: Member;
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }
    const token = header.slice(7);
    const claims = verifyAccessToken(token);
    const member = await prisma.member.findFirst({
      where: { id: claims.sub, deletedAt: null },
    });
    if (!member) throw unauthorized();
    (req as AuthedRequest).auth = claims;
    (req as AuthedRequest).member = member;
    next();
  } catch (error) {
    next(error instanceof Error && 'status' in error ? error : unauthorized());
  }
}

export function requirePost(...posts: PostType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authed = req as AuthedRequest;
    if (authed.member?.isSuperAdmin) {
      next();
      return;
    }
    if (!authed.auth || !posts.some((post) => post === authed.auth.post)) {
      next(forbidden('This post cannot open this screen'));
      return;
    }
    next();
  };
}
