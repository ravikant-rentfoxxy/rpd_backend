import type { Member, MemberPost, PostType } from '@prisma/client';
import { env } from '../../config/env.js';
import { labelOf, primaryPost } from './admin.posts.js';

function mediaUrl(key?: string | null) {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  return `${env.APP_URL}/api/v1/media/${key}`;
}

type AdminMember = Member & {
  state?: { name: string; code?: string } | null;
  district?: { name: string } | null;
  assembly?: { name: string } | null;
  booth?: { name: string; village?: string | null } | null;
  posts?: Pick<MemberPost, 'id' | 'post' | 'isPrimary' | 'endedAt'>[];
};

export function serializeAdminMember(member: AdminMember) {
  return {
    id: member.id,
    rowId: member.rowId,
    membershipNumber: member.membershipNumber,
    mobile: member.mobileE164,
    fullName: member.fullName,
    gender: member.gender,
    status: member.status,
    post: primaryPost(member, member.posts ?? []),
    isSuperAdmin: member.isSuperAdmin,
    photoUrl: mediaUrl(member.photoUrl),
    address: member.address,
    pincode: member.pincode,
    stateId: member.stateId,
    regionId: member.regionId,
    districtId: member.districtId,
    assemblyId: member.assemblyId,
    mandalId: member.mandalId,
    boothId: member.boothId,
    stateName: member.state?.name ?? null,
    districtName: member.district?.name ?? null,
    assemblyName: member.assembly?.name ?? null,
    boothName: member.booth?.name ?? null,
    lastActiveAt: member.lastActiveAt,
    createdAt: member.createdAt,
  };
}

export function serializeAdminOffice(post: {
  id: string;
  post: PostType;
  isPrimary: boolean;
  startedAt: Date;
  endedAt: Date | null;
  pageNumber: number | null;
  state?: { name: string } | null;
  region?: { name: string } | null;
  district?: { name: string } | null;
  assembly?: { name: string } | null;
  mandal?: { name: string } | null;
  booth?: { name: string; code: string } | null;
}) {
  return {
    id: post.id,
    post: post.post,
    title: labelOf(post.post),
    isPrimary: post.isPrimary,
    startedAt: post.startedAt,
    endedAt: post.endedAt,
    pageNumber: post.pageNumber,
    stateName: post.state?.name ?? null,
    regionName: post.region?.name ?? null,
    districtName: post.district?.name ?? null,
    assemblyName: post.assembly?.name ?? null,
    mandalName: post.mandal?.name ?? null,
    boothName: post.booth ? `${post.booth.code} ${post.booth.name}` : null,
  };
}

export function adminMediaUrl(key: string) {
  return mediaUrl(key);
}
