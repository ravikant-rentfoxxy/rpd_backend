import type { Member, Prisma } from '@prisma/client';
import { POST_RANK } from '../admin/admin.posts.js';

type GeoOwner = Pick<Member, 'isSuperAdmin' | 'stateId' | 'regionId' | 'districtId' | 'assemblyId' | 'mandalId' | 'boothId'>;

/**
 * Who a grievance can be handed to: office bearers in the same area as the assigner.
 * The area is the narrowest one the assigner actually has on their profile, so an
 * office bearer whose mandal or booth is not filled in still sees their assembly or
 * district instead of an empty list.
 */
export function assignScopeWhere(member: GeoOwner): Prisma.MemberWhereInput {
  if (member.isSuperAdmin) return {};
  if (member.mandalId) return { OR: [{ mandalId: member.mandalId }, { booth: { mandalId: member.mandalId } }] };
  if (member.assemblyId) {
    return { OR: [{ assemblyId: member.assemblyId }, { booth: { assemblyId: member.assemblyId } }] };
  }
  if (member.districtId) {
    return { OR: [{ districtId: member.districtId }, { booth: { districtId: member.districtId } }] };
  }
  if (member.regionId) return { OR: [{ regionId: member.regionId }, { district: { regionId: member.regionId } }] };
  if (member.stateId) {
    return { OR: [{ stateId: member.stateId }, { booth: { district: { stateId: member.stateId } } }] };
  }
  // National posts hold no geography of their own, so they can assign anywhere.
  return {};
}

/** In-memory twin of [assignScopeWhere], used when checking one chosen member. */
export function inAssignScope(member: GeoOwner, target: GeoOwner): boolean {
  if (member.isSuperAdmin) return true;
  if (member.mandalId) return target.mandalId === member.mandalId;
  if (member.assemblyId) return target.assemblyId === member.assemblyId;
  if (member.districtId) return target.districtId === member.districtId;
  if (member.regionId) return target.regionId === member.regionId;
  if (member.stateId) return target.stateId === member.stateId;
  return true;
}

/**
 * A grievance goes to an office bearer (above plain Member) who is below the
 * assigner's own post.
 */
export function canReceiveAssignment(targetRank: number, assignerRank: number): boolean {
  return targetRank > POST_RANK.MEMBER && targetRank < assignerRank;
}
