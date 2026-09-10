import { PrismaClient } from '@prisma/client';
import { UP_ASSEMBLIES } from './data/up-assemblies.js';

const prisma = new PrismaClient();

function districtCode(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 16);
}

function assemblyCode(name: string, index: number) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
  return slug || `AC${String(index + 1).padStart(3, '0')}`;
}

export async function upsertUpAssemblies(client: PrismaClient = prisma) {
  const unique = new Map<string, { name: string; district: string }>();
  for (const row of UP_ASSEMBLIES) {
    unique.set(`${row.district}::${row.name}`, row);
  }
  const rows = [...unique.values()];

  const state = await client.state.upsert({
    where: { code: 'UP' },
    update: { name: 'Uttar Pradesh', nameHi: 'उत्तर प्रदेश' },
    create: { code: 'UP', name: 'Uttar Pradesh', nameHi: 'उत्तर प्रदेश' },
  });

  const districtNames = [...new Set(rows.map((row) => row.district))].sort();
  const districtIds = new Map<string, string>();
  for (const name of districtNames) {
    const code = districtCode(name);
    const existing = await client.district.findFirst({
      where: { stateId: state.id, OR: [{ code }, { name }] },
    });
    const district = existing
      ? await client.district.update({ where: { id: existing.id }, data: { name, code } })
      : await client.district.create({ data: { stateId: state.id, name, code } });
    districtIds.set(name, district.id);
  }

  const counts = new Map<string, number>();
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const districtId = districtIds.get(row.district);
    if (!districtId) continue;
    const next = (counts.get(districtId) ?? 0) + 1;
    counts.set(districtId, next);
    const code = assemblyCode(row.name, next - 1);
    const existing = await client.assemblyConstituency.findFirst({
      where: { districtId, OR: [{ name: row.name }, { code }] },
    });
    if (existing) {
      await client.assemblyConstituency.update({
        where: { id: existing.id },
        data: { stateId: state.id, name: row.name, code, number: next },
      });
      updated += 1;
    } else {
      await client.assemblyConstituency.create({
        data: { stateId: state.id, districtId, name: row.name, code, number: next },
      });
      created += 1;
    }
  }

  return { stateId: state.id, districts: districtNames.length, assemblies: rows.length, created, updated };
}

async function main() {
  const result = await upsertUpAssemblies();
  console.log(
    `UP assemblies saved: ${result.assemblies} rows, ${result.districts} districts, ${result.created} created, ${result.updated} updated`,
  );
}

if (process.argv[1]?.includes('upsert-up-assemblies')) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
