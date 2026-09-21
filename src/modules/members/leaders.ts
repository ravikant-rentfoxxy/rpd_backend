import type { Member, PostType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl } from '../../lib/storage.js';
import { labelOf, rankOf } from '../admin/admin.posts.js';

type Area = { id: string; name: string; nameHi: string | null } | null;

type ScopeKey = 'stateId' | 'regionId' | 'districtId' | 'assemblyId' | 'mandalId' | 'boothId';

type Level = {
  level: 'NATIONAL' | 'STATE' | 'REGION' | 'DISTRICT' | 'ASSEMBLY' | 'MANDAL' | 'BOOTH';
  posts: PostType[];
  /** Area fields a leader's post is matched on, broadest first. */
  scope: ScopeKey[];
  area: Area;
};

/**
 * Office bearers who lead the member's own area, from the national level down to their booth.
 * Region fields missing on the member are filled in from their booth and district.
 */
export async function leadersPayload(member: Member) {
  const booth = member.boothId
    ? await prisma.booth.findUnique({
        where: { id: member.boothId },
        select: { id: true, name: true, boothNumber: true, mandalId: true, assemblyId: true, districtId: true },
      })
    : null;
  const districtId = member.districtId ?? booth?.districtId ?? null;
  const district = districtId
    ? await prisma.district.findUnique({ where: { id: districtId }, select: { id: true, name: true, nameHi: true, stateId: true, regionId: true } })
    : null;
  const stateId = member.stateId ?? district?.stateId ?? null;
  const regionId = member.regionId ?? district?.regionId ?? null;
  const assemblyId = member.assemblyId ?? booth?.assemblyId ?? null;
  const mandalId = member.mandalId ?? booth?.mandalId ?? null;

  const [state, region, assembly, mandal] = await Promise.all([
    stateId ? prisma.state.findUnique({ where: { id: stateId }, select: { id: true, name: true, nameHi: true } }) : null,
    regionId ? prisma.region.findUnique({ where: { id: regionId }, select: { id: true, name: true, nameHi: true } }) : null,
    assemblyId
      ? prisma.assemblyConstituency.findUnique({ where: { id: assemblyId }, select: { id: true, name: true, nameHi: true } })
      : null,
    mandalId ? prisma.mandal.findUnique({ where: { id: mandalId }, select: { id: true, name: true, nameHi: true } }) : null,
  ]);
  const boothArea: Area = booth ? { id: booth.id, name: `${booth.boothNumber} · ${booth.name}`, nameHi: null } : null;

  const mine: Record<ScopeKey, string | null> = {
    stateId: state?.id ?? null,
    regionId: region?.id ?? null,
    districtId: district?.id ?? null,
    assemblyId: assembly?.id ?? null,
    mandalId: mandal?.id ?? null,
    boothId: booth?.id ?? null,
  };

  const levels: Level[] = [
    { level: 'NATIONAL', posts: ['NATIONAL_PRESIDENT', 'NATIONAL_GENERAL_SECRETARY'], scope: [], area: null },
    { level: 'STATE', posts: ['STATE_PRESIDENT', 'STATE_GENERAL_SECRETARY'], scope: ['stateId'], area: state },
    { level: 'REGION', posts: ['REGIONAL_PRESIDENT'], scope: ['regionId'], area: region },
    {
      level: 'DISTRICT',
      posts: ['DISTRICT_PRESIDENT', 'DISTRICT_GENERAL_SECRETARY', 'DISTRICT_SECRETARY'],
      scope: ['districtId'],
      area: district,
    },
    { level: 'ASSEMBLY', posts: ['ASSEMBLY_IN_CHARGE'], scope: ['assemblyId'], area: assembly },
    // Mandal and booth are often not filled in yet, so these fall back to the assembly.
    { level: 'MANDAL', posts: ['MANDAL_PRESIDENT'], scope: ['assemblyId', 'mandalId'], area: mandal },
    { level: 'BOOTH', posts: ['BOOTH_ADHYAKSH', 'PANNA_PRAMUKH'], scope: ['assemblyId', 'mandalId', 'boothId'], area: boothArea },
  ];

  /**
   * The broadest field the member knows must match exactly; narrower ones must match
   * when both sides have them, and are ignored when the leader's post leaves them blank.
   */
  function levelWhere(row: Level): Prisma.MemberPostWhereInput | null {
    const known = row.scope.filter((key) => mine[key]);
    if (row.scope.length && !known.length) return null;
    const [base, ...narrower] = known;
    return {
      post: { in: row.posts },
      ...(base ? { [base]: mine[base] } : {}),
      AND: narrower.map((key) => ({ OR: [{ [key]: mine[key] }, { [key]: null }] })),
    };
  }

  function inLevel(row: Level, item: Record<ScopeKey, string | null> & { post: PostType }) {
    if (!row.posts.includes(item.post)) return false;
    const known = row.scope.filter((key) => mine[key]);
    const [base, ...narrower] = known;
    if (base && item[base] !== mine[base]) return false;
    return narrower.every((key) => item[key] === null || item[key] === mine[key]);
  }

  // Skip levels the member's address doesn't reach (e.g. no region mapped for their district).
  const reachable = levels.filter((row) => levelWhere(row) !== null);

  const rows = await prisma.memberPost.findMany({
    where: {
      endedAt: null,
      member: { deletedAt: null },
      OR: reachable.map((row) => levelWhere(row)!),
    },
    select: {
      post: true,
      pageNumber: true,
      stateId: true,
      regionId: true,
      districtId: true,
      assemblyId: true,
      mandalId: true,
      boothId: true,
      member: { select: { id: true, fullName: true, photoUrl: true } },
    },
    take: 200,
  });

  return {
    levels: reachable.map((row) => {
      const seen = new Set<string>();
      const leaders = rows
        .filter((item) => inLevel(row, item))
        .sort((a, b) => rankOf(b.post) - rankOf(a.post) || (a.pageNumber ?? 0) - (b.pageNumber ?? 0))
        .filter((item) => {
          const key = `${item.member.id}:${item.post}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item) => ({
          id: item.member.id,
          name: item.member.fullName,
          photoUrl: item.member.photoUrl ? mediaPublicUrl(item.member.photoUrl) : null,
          post: item.post,
          postLabel: labelOf(item.post),
          pageNumber: item.pageNumber,
          isMe: item.member.id === member.id,
        }));
      return {
        level: row.level,
        areaName: row.area?.name ?? null,
        areaNameHi: row.area?.nameHi ?? null,
        leaders,
      };
    }),
  };
}
