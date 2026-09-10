import { OrgLevelCode, PostType, PrismaClient } from '@prisma/client';

const LEVELS: Array<{
  code: OrgLevelCode;
  name: string;
  nameHi: string;
  sortOrder: number;
  posts: Array<{ post: PostType; title: string; titleHi: string }>;
}> = [
  {
    code: OrgLevelCode.NATIONAL,
    name: 'National',
    nameHi: 'राष्ट्रीय',
    sortOrder: 1,
    posts: [
      { post: PostType.NATIONAL_PRESIDENT, title: 'National President', titleHi: 'राष्ट्रीय अध्यक्ष' },
      { post: PostType.NATIONAL_GENERAL_SECRETARY, title: 'General Secretary', titleHi: 'महामंत्री' },
    ],
  },
  {
    code: OrgLevelCode.STATE,
    name: 'State',
    nameHi: 'राज्य',
    sortOrder: 2,
    posts: [
      { post: PostType.STATE_PRESIDENT, title: 'State President', titleHi: 'राज्य अध्यक्ष' },
      { post: PostType.STATE_GENERAL_SECRETARY, title: 'State General Secretary', titleHi: 'राज्य महामंत्री' },
    ],
  },
  {
    code: OrgLevelCode.REGION,
    name: 'Region / Zone',
    nameHi: 'क्षेत्र / जोन',
    sortOrder: 3,
    posts: [{ post: PostType.REGIONAL_PRESIDENT, title: 'Regional President', titleHi: 'क्षेत्रीय अध्यक्ष' }],
  },
  {
    code: OrgLevelCode.DISTRICT,
    name: 'District',
    nameHi: 'जिला',
    sortOrder: 4,
    posts: [
      { post: PostType.DISTRICT_PRESIDENT, title: 'District President', titleHi: 'जिला अध्यक्ष' },
      { post: PostType.DISTRICT_GENERAL_SECRETARY, title: 'District General Secretary', titleHi: 'जिला महामंत्री' },
    ],
  },
  {
    code: OrgLevelCode.ASSEMBLY,
    name: 'Assembly Constituency',
    nameHi: 'विधानसभा क्षेत्र',
    sortOrder: 5,
    posts: [{ post: PostType.ASSEMBLY_IN_CHARGE, title: 'Assembly In-charge', titleHi: 'विधानसभा प्रभारी' }],
  },
  {
    code: OrgLevelCode.MANDAL,
    name: 'Mandal / Block',
    nameHi: 'मंडल / ब्लॉक',
    sortOrder: 6,
    posts: [{ post: PostType.MANDAL_PRESIDENT, title: 'Mandal President', titleHi: 'मंडल अध्यक्ष' }],
  },
];

const prisma = new PrismaClient();

export async function seedOrgHierarchy(client: PrismaClient) {
  for (const level of LEVELS) {
    const row = await client.orgLevel.upsert({
      where: { code: level.code },
      update: { name: level.name, nameHi: level.nameHi, sortOrder: level.sortOrder },
      create: { code: level.code, name: level.name, nameHi: level.nameHi, sortOrder: level.sortOrder },
    });
    for (const post of level.posts) {
      await client.orgPost.upsert({
        where: { post: post.post },
        update: { levelId: row.id, title: post.title, titleHi: post.titleHi },
        create: { levelId: row.id, post: post.post, title: post.title, titleHi: post.titleHi },
      });
    }
  }
}

if (process.argv[1]?.includes('seed-org-hierarchy')) {
  seedOrgHierarchy(prisma)
    .then(() => {
      console.log('Org hierarchy saved: National → State → Region → District → Assembly → Mandal');
      return prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
