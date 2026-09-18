import type { NextFunction, Request, Response } from 'express';
import type { Member, MemberPost } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { forbidden, unauthorized } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { actorRank, POST_RANK } from './admin.posts.js';
import { adminAreaOf, type AdminArea } from './admin.scope.js';

export type AdminRequest = Request & {
  member: Member;
  posts: MemberPost[];
  rank: number;
  area: AdminArea;
};

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = verifyAccessToken(header.slice(7));
    const member = await prisma.member.findFirst({
      where: { id: claims.sub, deletedAt: null },
    });
    if (!member) throw unauthorized();
    const posts = await prisma.memberPost.findMany({
      where: { memberId: member.id, endedAt: null },
    });
    const rank = actorRank(member, posts);
    if (!member.isSuperAdmin && member.status !== 'VERIFIED') {
      throw forbidden('Verify your membership before opening the admin portal');
    }
    if (!member.isSuperAdmin && rank <= POST_RANK.MEMBER) {
      throw forbidden('This portal is for office bearers');
    }
    const admin = req as AdminRequest;
    admin.member = member;
    admin.posts = posts;
    admin.rank = rank;
    admin.area = adminAreaOf(member, rank);
    next();
  } catch (error) {
    next(error instanceof Error && 'status' in error ? error : unauthorized());
  }
}
