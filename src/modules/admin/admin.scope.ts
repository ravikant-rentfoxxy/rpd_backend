import type { Member, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { POST_RANK } from './admin.posts.js';

export type AreaLevel = 'NATIONAL' | 'STATE' | 'REGION' | 'DISTRICT' | 'ASSEMBLY' | 'MANDAL' | 'BOOTH';

/** The part of the organisation an officer manages in the admin portal. */
export type AdminArea = {
  level: AreaLevel;
  stateId?: string;
  regionId?: string;
  districtId?: string;
  assemblyId?: string;
  mandalId?: string;
  boothId?: string;
};

type GeoMember = Pick<Member, 'isSuperAdmin' | 'stateId' | 'regionId' | 'districtId' | 'assemblyId' | 'mandalId' | 'boothId'>;

const LADDER: { level: Exclude<AreaLevel, 'NATIONAL'>; key: keyof GeoMember; minRank: number }[] = [
  { level: 'BOOTH', key: 'boothId', minRank: 0 },
  { level: 'MANDAL', key: 'mandalId', minRank: POST_RANK.MANDAL_PRESIDENT },
  { level: 'ASSEMBLY', key: 'assemblyId', minRank: POST_RANK.ASSEMBLY_IN_CHARGE },
  { level: 'DISTRICT', key: 'districtId', minRank: POST_RANK.DISTRICT_SECRETARY },
  { level: 'REGION', key: 'regionId', minRank: POST_RANK.REGIONAL_PRESIDENT },
  { level: 'STATE', key: 'stateId', minRank: POST_RANK.STATE_GENERAL_SECRETARY },
];

/**
 * Starts at the level the officer's post covers and walks up until the profile has an id
 * for that level, so an officer with an incomplete profile manages the next wider area
 * instead of seeing nothing.
 */
export function adminAreaOf(member: GeoMember, rank: number): AdminArea {
  if (member.isSuperAdmin || rank >= POST_RANK.NATIONAL_GENERAL_SECRETARY) return { level: 'NATIONAL' };
  let start = 0;
  LADDER.forEach((step, index) => {
    if (rank >= step.minRank) start = index;
  });
  for (let index = start; index < LADDER.length; index++) {
    const step = LADDER[index]!;
    const id = member[step.key];
    if (typeof id === 'string' && id) return { level: step.level, [step.key]: id } as AdminArea;
  }
  return { level: 'NATIONAL' };
}

export async function areaName(area: AdminArea): Promise<string> {
  switch (area.level) {
    case 'NATIONAL':
      return 'All India';
    case 'STATE':
      return (await prisma.state.findUnique({ where: { id: area.stateId! }, select: { name: true } }))?.name ?? 'State';
    case 'REGION':
      return (await prisma.region.findUnique({ where: { id: area.regionId! }, select: { name: true } }))?.name ?? 'Region';
    case 'DISTRICT':
      return (await prisma.district.findUnique({ where: { id: area.districtId! }, select: { name: true } }))?.name ?? 'District';
    case 'ASSEMBLY':
      return (
        (await prisma.assemblyConstituency.findUnique({ where: { id: area.assemblyId! }, select: { name: true } }))?.name ??
        'Assembly'
      );
    case 'MANDAL':
      return (await prisma.mandal.findUnique({ where: { id: area.mandalId! }, select: { name: true } }))?.name ?? 'Mandal';
    case 'BOOTH': {
      const booth = await prisma.booth.findUnique({ where: { id: area.boothId! }, select: { code: true, name: true } });
      return booth ? `${booth.code} ${booth.name}` : 'Booth';
    }
  }
}

export function areaBoothWhere(area: AdminArea): Prisma.BoothWhereInput {
  switch (area.level) {
    case 'NATIONAL':
      return {};
    case 'STATE':
      return { district: { stateId: area.stateId } };
    case 'REGION':
      return { district: { regionId: area.regionId } };
    case 'DISTRICT':
      return { districtId: area.districtId };
    case 'ASSEMBLY':
      return { assemblyId: area.assemblyId };
    case 'MANDAL':
      return { mandalId: area.mandalId };
    case 'BOOTH':
      return { id: area.boothId };
  }
}

/** Members whose profile, or whose booth, is inside the area. */
export function areaMemberWhere(area: AdminArea): Prisma.MemberWhereInput {
  switch (area.level) {
    case 'NATIONAL':
      return {};
    case 'STATE':
      return { OR: [{ stateId: area.stateId }, { booth: areaBoothWhere(area) }] };
    case 'REGION':
      return { OR: [{ regionId: area.regionId }, { district: { regionId: area.regionId } }] };
    case 'DISTRICT':
      return { OR: [{ districtId: area.districtId }, { booth: areaBoothWhere(area) }] };
    case 'ASSEMBLY':
      return { OR: [{ assemblyId: area.assemblyId }, { booth: areaBoothWhere(area) }] };
    case 'MANDAL':
      return { OR: [{ mandalId: area.mandalId }, { booth: areaBoothWhere(area) }] };
    case 'BOOTH':
      return { boothId: area.boothId };
  }
}

export function inArea(area: AdminArea, target: GeoMember): boolean {
  switch (area.level) {
    case 'NATIONAL':
      return true;
    case 'STATE':
      return target.stateId === area.stateId;
    case 'REGION':
      return target.regionId === area.regionId;
    case 'DISTRICT':
      return target.districtId === area.districtId;
    case 'ASSEMBLY':
      return target.assemblyId === area.assemblyId;
    case 'MANDAL':
      return target.mandalId === area.mandalId;
    case 'BOOTH':
      return target.boothId === area.boothId;
  }
}

/** Activities recorded by someone in the area, or at a booth in the area. */
export function areaActivityWhere(area: AdminArea): Prisma.ActivityWhereInput {
  if (area.level === 'NATIONAL') return {};
  return { OR: [{ actor: areaMemberWhere(area) }, { booth: areaBoothWhere(area) }] };
}

/** Grievances written by someone in the area, or tagged to a place in the area. */
export function areaRegionPostWhere(area: AdminArea): Prisma.RegionPostWhereInput {
  const author = { author: areaMemberWhere(area) };
  switch (area.level) {
    case 'NATIONAL':
      return {};
    case 'DISTRICT':
      return { OR: [author, { districtId: area.districtId }] };
    case 'ASSEMBLY':
      return { OR: [author, { assemblyId: area.assemblyId }] };
    case 'BOOTH':
      return { OR: [author, { boothId: area.boothId }] };
    default:
      return author;
  }
}

/** Events and tasks hosted by someone in the area, or pinned to a place in the area. */
export function areaHostedWhere(area: AdminArea): Prisma.OrgEventWhereInput & Prisma.OrgTaskWhereInput {
  const host = { host: areaMemberWhere(area) };
  switch (area.level) {
    case 'NATIONAL':
      return {};
    case 'STATE':
      return { OR: [host, { stateId: area.stateId }] };
    case 'DISTRICT':
      return { OR: [host, { districtId: area.districtId }] };
    case 'ASSEMBLY':
      return { OR: [host, { assemblyId: area.assemblyId }] };
    default:
      return host;
  }
}
