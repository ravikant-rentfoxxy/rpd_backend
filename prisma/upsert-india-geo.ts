import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { upsertUpAssemblies } from './upsert-up-assemblies.js';

const prisma = new PrismaClient();

const UNION_TERRITORY_CODES = new Set(['AN', 'CH', 'DH', 'JK', 'LA', 'LD', 'DL', 'PY']);

type GeoFile = {
  states: Array<{ code: string; name: string; nameHi?: string | null }>;
  districts: Array<{ stateCode: string; name: string }>;
  assemblies: Array<{ stateCode: string; district: string; name: string; number: number }>;
};

function loadGeo(): GeoFile {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(here, 'data/india-geo.json'), 'utf8')) as GeoFile;
}

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bdistrict\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value: string, max: number) {
  const base = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, max);
  return base || 'X';
}

function uniqueCode(base: string, used: Set<string>, max: number) {
  let code = base.slice(0, max);
  let i = 2;
  while (used.has(code)) {
    const suffix = String(i++);
    code = `${base.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
  }
  used.add(code);
  return code;
}

export async function upsertIndiaGeo(client: PrismaClient = prisma) {
  const up = await upsertUpAssemblies(client);
  const geo = loadGeo();

  const stateIds = new Map<string, string>();
  for (const row of geo.states) {
    if (UNION_TERRITORY_CODES.has(row.code)) continue;
    const state = await client.state.upsert({
      where: { code: row.code },
      update: { name: row.name, nameHi: row.nameHi ?? undefined },
      create: { code: row.code, name: row.name, nameHi: row.nameHi ?? undefined },
    });
    stateIds.set(row.code, state.id);
  }

  const existingDistricts = await client.district.findMany({
    select: { id: true, stateId: true, name: true, code: true },
  });
  const districtByKey = new Map<string, { id: string; code: string }>();
  const usedDistrictCodes = new Map<string, Set<string>>();
  for (const district of existingDistricts) {
    districtByKey.set(`${district.stateId}::${norm(district.name)}`, { id: district.id, code: district.code });
    districtByKey.set(`${district.stateId}::code:${district.code}`, { id: district.id, code: district.code });
    const used = usedDistrictCodes.get(district.stateId) ?? new Set<string>();
    used.add(district.code);
    usedDistrictCodes.set(district.stateId, used);
  }

  let districtsCreated = 0;
  for (const row of geo.districts) {
    const stateId = stateIds.get(row.stateCode);
    if (!stateId) continue;
    const key = `${stateId}::${norm(row.name)}`;
    if (districtByKey.has(key)) continue;
    const used = usedDistrictCodes.get(stateId) ?? new Set<string>();
    const code = uniqueCode(slug(row.name, 16), used, 16);
    usedDistrictCodes.set(stateId, used);
    const district = await client.district.create({
      data: { stateId, name: row.name, code },
    });
    districtByKey.set(key, { id: district.id, code: district.code });
    districtByKey.set(`${stateId}::code:${district.code}`, { id: district.id, code: district.code });
    districtsCreated += 1;
  }

  const existingAssemblies = await client.assemblyConstituency.findMany({
    select: { id: true, stateId: true, districtId: true, name: true, code: true, number: true },
  });
  const assemblyByDistrictName = new Map<string, (typeof existingAssemblies)[number]>();
  const usedAssemblyCodes = new Map<string, Set<string>>();
  for (const row of existingAssemblies) {
    assemblyByDistrictName.set(`${row.districtId}::${norm(row.name)}`, row);
    const used = usedAssemblyCodes.get(row.districtId) ?? new Set<string>();
    used.add(row.code);
    usedAssemblyCodes.set(row.districtId, used);
  }

  let assembliesCreated = 0;
  let assembliesUpdated = 0;
  for (const row of geo.assemblies) {
    const stateId = stateIds.get(row.stateCode);
    if (!stateId) continue;
    const district = districtByKey.get(`${stateId}::${norm(row.district)}`);
    if (!district) continue;
    const existing = assemblyByDistrictName.get(`${district.id}::${norm(row.name)}`);
    if (existing) {
      if (existing.number !== row.number || existing.name !== row.name || existing.stateId !== stateId) {
        await client.assemblyConstituency.update({
          where: { id: existing.id },
          data: { stateId, name: row.name, number: row.number || existing.number },
        });
        assembliesUpdated += 1;
      }
      continue;
    }
    const used = usedAssemblyCodes.get(district.id) ?? new Set<string>();
    const code = uniqueCode(slug(row.name, 12) || `AC${String(row.number).padStart(3, '0')}`, used, 16);
    usedAssemblyCodes.set(district.id, used);
    const created = await client.assemblyConstituency.create({
      data: {
        stateId,
        districtId: district.id,
        name: row.name,
        code,
        number: row.number || used.size,
      },
    });
    assemblyByDistrictName.set(`${district.id}::${norm(row.name)}`, created);
    assembliesCreated += 1;
  }

  return {
    states: geo.states.length,
    districts: geo.districts.length,
    assemblies: geo.assemblies.length + up.assemblies,
    districtsCreated,
    assembliesCreated,
    assembliesUpdated,
  };
}

async function main() {
  const result = await upsertIndiaGeo();
  console.log(
    `India geo saved: ${result.states} states, ${result.districts} districts, ${result.assemblies} assemblies ` +
      `(+${result.districtsCreated} districts, +${result.assembliesCreated} ACs, ${result.assembliesUpdated} ACs updated)`,
  );
}

if (process.argv[1]?.includes('upsert-india-geo')) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
