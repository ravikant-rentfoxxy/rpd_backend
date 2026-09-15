import type { Member, MemberPost, PostType } from '@prisma/client';

export const POST_RANK: Record<PostType | 'SUPER_ADMIN', number> = {
  SUPER_ADMIN: 1000,
  NATIONAL_PRESIDENT: 100,
  NATIONAL_GENERAL_SECRETARY: 95,
  STATE_PRESIDENT: 90,
  STATE_GENERAL_SECRETARY: 85,
  REGIONAL_PRESIDENT: 80,
  DISTRICT_PRESIDENT: 70,
  DISTRICT_GENERAL_SECRETARY: 65,
  DISTRICT_SECRETARY: 60,
  ASSEMBLY_IN_CHARGE: 50,
  MANDAL_PRESIDENT: 40,
  BOOTH_ADHYAKSH: 30,
  PANNA_PRAMUKH: 20,
  MEMBER: 10,
};

export const POST_LABEL: Record<PostType | 'SUPER_ADMIN', string> = {
  SUPER_ADMIN: 'Super Admin',
  NATIONAL_PRESIDENT: 'National President',
  NATIONAL_GENERAL_SECRETARY: 'National General Secretary',
  STATE_PRESIDENT: 'State President',
  STATE_GENERAL_SECRETARY: 'State General Secretary',
  REGIONAL_PRESIDENT: 'Regional President',
  DISTRICT_PRESIDENT: 'District President',
  DISTRICT_GENERAL_SECRETARY: 'District General Secretary',
  DISTRICT_SECRETARY: 'District Secretary',
  ASSEMBLY_IN_CHARGE: 'Assembly In-charge',
  MANDAL_PRESIDENT: 'Mandal President',
  BOOTH_ADHYAKSH: 'Booth Adhyaksh',
  PANNA_PRAMUKH: 'Panna Pramukh',
  MEMBER: 'Member',
};

export const ALL_POSTS = Object.keys(POST_RANK).filter((key) => key !== 'SUPER_ADMIN') as PostType[];

export function rankOf(post?: string | null) {
  if (!post) return POST_RANK.MEMBER;
  return POST_RANK[post as keyof typeof POST_RANK] ?? POST_RANK.MEMBER;
}

export function labelOf(post?: string | null) {
  if (!post) return POST_LABEL.MEMBER;
  return POST_LABEL[post as keyof typeof POST_LABEL] ?? post;
}

export function actorRank(member: Pick<Member, 'isSuperAdmin'>, posts: Pick<MemberPost, 'post' | 'endedAt'>[]) {
  if (member.isSuperAdmin) return POST_RANK.SUPER_ADMIN;
  const active = posts.filter((row) => !row.endedAt);
  if (!active.length) return POST_RANK.MEMBER;
  return Math.max(...active.map((row) => rankOf(row.post)));
}

export function primaryPost(member: Pick<Member, 'isSuperAdmin'>, posts: Pick<MemberPost, 'post' | 'isPrimary' | 'endedAt'>[]) {
  if (member.isSuperAdmin) return 'SUPER_ADMIN';
  const active = posts.filter((row) => !row.endedAt);
  if (!active.length) return 'MEMBER';
  return active.reduce((best, row) => {
    const delta = rankOf(row.post) - rankOf(best.post);
    if (delta > 0) return row;
    if (delta === 0 && row.isPrimary && !best.isPrimary) return row;
    return best;
  }).post;
}

export function canAssignPost(actor: number, target: number, nextPost: string) {
  return actor > target && actor > rankOf(nextPost);
}

export function canManageMember(actor: number, target: number) {
  return actor > target;
}

export function assignablePosts(actor: number) {
  return ALL_POSTS.filter((post) => actor > rankOf(post)).map((post) => ({
    post,
    title: POST_LABEL[post],
    rank: POST_RANK[post],
  }));
}

export function memberScopeWhere(member: Member, rank: number) {
  if (member.isSuperAdmin || rank >= POST_RANK.NATIONAL_GENERAL_SECRETARY) return {};
  if (rank >= POST_RANK.STATE_GENERAL_SECRETARY && member.stateId) {
    return { OR: [{ stateId: member.stateId }, { booth: { district: { stateId: member.stateId } } }] };
  }
  if (rank >= POST_RANK.REGIONAL_PRESIDENT && member.regionId) {
    return { OR: [{ regionId: member.regionId }, { district: { regionId: member.regionId } }] };
  }
  if (rank >= POST_RANK.DISTRICT_SECRETARY && member.districtId) {
    return { OR: [{ districtId: member.districtId }, { booth: { districtId: member.districtId } }] };
  }
  if (rank >= POST_RANK.ASSEMBLY_IN_CHARGE && member.assemblyId) {
    return { OR: [{ assemblyId: member.assemblyId }, { booth: { assemblyId: member.assemblyId } }] };
  }
  if (rank >= POST_RANK.MANDAL_PRESIDENT && member.mandalId) {
    return { OR: [{ mandalId: member.mandalId }, { booth: { mandalId: member.mandalId } }] };
  }
  if (member.boothId) return { boothId: member.boothId };
  return { id: member.id };
}

export function inMemberScope(actor: Member, actorRankValue: number, target: Member) {
  if (actor.isSuperAdmin || actorRankValue >= POST_RANK.NATIONAL_GENERAL_SECRETARY) return true;
  if (actorRankValue >= POST_RANK.STATE_GENERAL_SECRETARY && actor.stateId) {
    return target.stateId === actor.stateId;
  }
  if (actorRankValue >= POST_RANK.REGIONAL_PRESIDENT && actor.regionId) {
    return target.regionId === actor.regionId;
  }
  if (actorRankValue >= POST_RANK.DISTRICT_SECRETARY && actor.districtId) {
    return target.districtId === actor.districtId;
  }
  if (actorRankValue >= POST_RANK.ASSEMBLY_IN_CHARGE && actor.assemblyId) {
    return target.assemblyId === actor.assemblyId;
  }
  if (actorRankValue >= POST_RANK.MANDAL_PRESIDENT && actor.mandalId) {
    return target.mandalId === actor.mandalId || target.boothId === actor.boothId;
  }
  if (actor.boothId) return target.boothId === actor.boothId;
  return target.id === actor.id;
}

export function scopeForPost(post: PostType, member: Member, body: Record<string, string | null | undefined>) {
  const pick = (key: string) => body[key] || (member as unknown as Record<string, string | null>)[key] || null;
  if (post.startsWith('NATIONAL_')) {
    return { stateId: null, regionId: null, districtId: null, assemblyId: null, mandalId: null, boothId: null };
  }
  if (post.startsWith('STATE_')) {
    return { stateId: pick('stateId'), regionId: null, districtId: null, assemblyId: null, mandalId: null, boothId: null };
  }
  if (post === 'REGIONAL_PRESIDENT') {
    return {
      stateId: pick('stateId'),
      regionId: pick('regionId'),
      districtId: null,
      assemblyId: null,
      mandalId: null,
      boothId: null,
    };
  }
  if (post.startsWith('DISTRICT_')) {
    return {
      stateId: pick('stateId'),
      regionId: pick('regionId'),
      districtId: pick('districtId'),
      assemblyId: null,
      mandalId: null,
      boothId: null,
    };
  }
  if (post === 'ASSEMBLY_IN_CHARGE') {
    return {
      stateId: pick('stateId'),
      regionId: pick('regionId'),
      districtId: pick('districtId'),
      assemblyId: pick('assemblyId'),
      mandalId: null,
      boothId: null,
    };
  }
  if (post === 'MANDAL_PRESIDENT') {
    return {
      stateId: pick('stateId'),
      regionId: pick('regionId'),
      districtId: pick('districtId'),
      assemblyId: pick('assemblyId'),
      mandalId: pick('mandalId'),
      boothId: null,
    };
  }
  return {
    stateId: pick('stateId'),
    regionId: pick('regionId'),
    districtId: pick('districtId'),
    assemblyId: pick('assemblyId'),
    mandalId: pick('mandalId'),
    boothId: pick('boothId'),
  };
}
