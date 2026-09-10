import type {
  AssemblyConstituency,
  Booth,
  District,
  Mandal,
  Member,
  MemberPost,
  MembershipCard,
} from '@prisma/client';
import { mediaPublicUrl } from '../../lib/storage.js';
import { inviteCodeFrom, membershipNumberFromRowId } from '../../lib/membership.js';

type MemberWithGraph = Member & {
  booth?:
    | (Booth & {
        mandal?: Mandal | null;
        assembly?: AssemblyConstituency | null;
        district?: (District & { state?: { name: string } | null }) | null;
      })
    | null;
  state?: { name: string; code?: string } | null;
  district?: { name: string } | null;
  assembly?: { code: string; name: string } | null;
  posts?: MemberPost[];
  card?: MembershipCard | null;
  recruitedBy?: Pick<Member, 'id' | 'fullName' | 'membershipNumber' | 'rowId'> | null;
};

export function serializeBooth(
  booth: Booth & {
    mandal?: Mandal | null;
    assembly?: AssemblyConstituency | null;
    district?: (District & { state?: { name: string } | null }) | null;
  },
  distanceMetres?: number,
) {
  return {
    id: booth.id,
    code: booth.code,
    boothNumber: booth.boothNumber,
    partNumber: booth.partNumber,
    name: booth.name,
    landmark: booth.landmark,
    village: booth.village,
    pincode: booth.pincode,
    voterCount: booth.voterCount,
    memberCount: booth.memberCount,
    latitude: Number(booth.latitude),
    longitude: Number(booth.longitude),
    healthScore: booth.healthScore,
    healthBand: booth.healthBand,
    mandalName: booth.mandal?.name ?? null,
    assemblyName: booth.assembly?.name ?? null,
    districtId: booth.districtId,
    stateId: booth.district?.stateId ?? null,
    districtName: booth.district?.name ?? null,
    stateName: booth.district?.state?.name ?? null,
    lastActivityAt: booth.lastActivityAt,
    distanceMetres: distanceMetres ?? null,
  };
}

export function serializeMember(member: MemberWithGraph) {
  const primary = member.posts?.find((p) => p.isPrimary) ?? member.posts?.[0];
  return {
    id: member.id,
    rowId: member.rowId,
    membershipNumber: member.membershipNumber ?? membershipNumberFromRowId(member.rowId, member.state?.code),
    stateCode: member.state?.code ?? null,
    mobile: member.mobileE164,
    fullName: member.fullName,
    dateOfBirth: member.dateOfBirth,
    gender: member.gender,
    locale: member.locale,
    status: member.status,
    verifyStatus: member.status,
    verified: member.status === 'VERIFIED' || member.isSuperAdmin,
    isSuperAdmin: member.isSuperAdmin,
    photoUrl: member.photoUrl ? mediaPublicUrl(member.photoUrl) : null,
    address: member.address,
    pincode: member.pincode,
    whatsappOptIn: member.whatsappOptIn,
    contributionType: member.contributionType,
    referralCode: member.referralCode,
    inviteCode: inviteCodeFrom(member.membershipNumber ?? member.id),
    volunteerMode: member.volunteerMode,
    weeklyHours: member.weeklyHours,
    validTo: member.validTo,
    post: member.isSuperAdmin ? 'SUPER_ADMIN' : (primary?.post ?? 'MEMBER'),
    stateId: member.stateId,
    regionId: member.regionId,
    districtId: member.districtId,
    assemblyId: member.assemblyId,
    mandalId: member.mandalId,
    boothId: member.boothId,
    stateName: member.state?.name ?? member.booth?.district?.state?.name ?? null,
    districtName: member.district?.name ?? member.booth?.district?.name ?? null,
    assemblyName: member.assembly?.name ?? member.booth?.assembly?.name ?? null,
    booth: member.booth ? serializeBooth(member.booth) : null,
    card: member.card
      ? {
          publicCode: member.card.publicCode,
          validTo: member.card.validTo,
          issuedAt: member.card.issuedAt,
        }
      : null,
    recruitedBy: member.recruitedBy
      ? {
          id: member.recruitedBy.id,
          fullName: member.recruitedBy.fullName,
          rowId: member.recruitedBy.rowId,
          membershipNumber: member.recruitedBy.membershipNumber ?? membershipNumberFromRowId(member.recruitedBy.rowId),
        }
      : null,
    lastActiveAt: member.lastActiveAt,
    createdAt: member.createdAt,
  };
}
