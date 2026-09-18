import type { Member, PostType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { mediaPublicUrl } from '../../lib/storage.js';
import { labelOf, rankOf } from '../admin/admin.posts.js';

type Area = { id: string; name: string; nameHi: string | null } | null;

type Level = {
  level: 'NATIONAL' | 'STATE' | 'REGION' | 'DISTRICT' | 'ASSEMBLY' | 'MANDAL' | 'BOOTH';
  posts: PostType[];
  scope: keyof Pick<Prisma.MemberPostWhereInput, 'stateId' | 'regionId' | 'districtId' | 'assemblyId' | 'mandalId' | 'boothId'> | null;
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

  const levels: Level[] = [
    { level: 'NATIONAL', posts: ['NATIONAL_PRESIDENT', 'NATIONAL_GENERAL_SECRETARY'], scope: null, area: null },
    { level: 'STATE', posts: ['STATE_PRESIDENT', 'STATE_GENERAL_SECRETARY'], scope: 'stateId', area: state },
    { level: 'REGION', posts: ['REGIONAL_PRESIDENT'], scope: 'regionId', area: region },
    {
      level: 'DISTRICT',
      posts: ['DISTRICT_PRESIDENT', 'DISTRICT_GENERAL_SECRETARY', 'DISTRICT_SECRETARY'],
      scope: 'districtId',
      area: district,
    },
    { level: 'ASSEMBLY', posts: ['ASSEMBLY_IN_CHARGE'], scope: 'assemblyId', area: assembly },
    { level: 'MANDAL', posts: ['MANDAL_PRESIDENT'], scope: 'mandalId', area: mandal },
    { level: 'BOOTH', posts: ['BOOTH_ADHYAKSH', 'PANNA_PRAMUKH'], scope: 'boothId', area: boothArea },
  ];
  // Skip levels the member's address doesn't reach (e.g. no region mapped for their district).
  const reachable = levels.filter((row) => row.scope === null || row.area);

  const rows = await prisma.memberPost.findMany({
    where: {
      endedAt: null,
      member: { deletedAt: null },
      OR: reachable.map((row) => ({
        post: { in: row.posts },
        ...(row.scope ? { [row.scope]: row.area!.id } : {}),
      })),
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
        .filter((item) => row.posts.includes(item.post) && (!row.scope || item[row.scope] === row.area!.id))
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
