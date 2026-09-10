import type { PrismaClient } from '@prisma/client';

export const POST_ISSUES = [
  {
    code: 'WATER',
    name: 'Water',
    nameHi: 'पानी',
    nameBho: 'पानी',
    priority: 1,
    band: 'VERY_HIGH',
    reason: 'Drinking water, supply interruptions, contamination, pipelines',
  },
  {
    code: 'ROADS_TRANSPORT',
    name: 'Roads & Transport',
    nameHi: 'सड़क और परिवहन',
    nameBho: 'सड़क आ यातायात',
    priority: 2,
    band: 'VERY_HIGH',
    reason: 'Potholes, damaged roads, traffic, public transport affect daily travel',
  },
  {
    code: 'ELECTRICITY',
    name: 'Electricity',
    nameHi: 'बिजली',
    nameBho: 'बिजली',
    priority: 3,
    band: 'VERY_HIGH',
    reason: 'Power cuts, transformers, streetlights, exposed wires',
  },
  {
    code: 'HEALTH',
    name: 'Health',
    nameHi: 'स्वास्थ्य',
    nameBho: 'स्वास्थ्य',
    priority: 4,
    band: 'VERY_HIGH',
    reason: 'Hospitals, medicines, ambulances and basic healthcare are critical',
  },
  {
    code: 'SANITATION_GARBAGE',
    name: 'Sanitation & Garbage',
    nameHi: 'स्वच्छता और कचरा',
    nameBho: 'सफाई आ कचरा',
    priority: 5,
    band: 'VERY_HIGH',
    reason: 'Garbage accumulation directly affects hygiene and disease prevention',
  },
  {
    code: 'DRAINAGE_SEWERAGE',
    name: 'Drainage & Sewerage',
    nameHi: 'नाली और सीवर',
    nameBho: 'नाली आ सीवर',
    priority: 6,
    band: 'HIGH',
    reason: 'Blocked drains, sewage overflow and waterlogging',
  },
  {
    code: 'EDUCATION',
    name: 'Education',
    nameHi: 'शिक्षा',
    nameBho: 'शिक्षा',
    priority: 7,
    band: 'HIGH',
    reason: 'Schools, teachers, infrastructure and scholarships',
  },
  {
    code: 'GOVERNMENT_SERVICES',
    name: 'Government Services',
    nameHi: 'सरकारी सेवाएँ',
    nameBho: 'सरकारी सेवा',
    priority: 8,
    band: 'HIGH',
    reason: 'Certificates, ration cards, welfare schemes and office delays',
  },
  {
    code: 'PUBLIC_SAFETY',
    name: 'Public Safety',
    nameHi: 'सार्वजनिक सुरक्षा',
    nameBho: 'सार्वजनिक सुरक्षा',
    priority: 9,
    band: 'HIGH',
    reason: 'Unsafe roads/areas, lighting, CCTV and emergency concerns',
  },
  {
    code: 'AGRICULTURE_RURAL',
    name: 'Agriculture & Rural Development',
    nameHi: 'कृषि और ग्रामीण विकास',
    nameBho: 'खेती आ गाँव विकास',
    priority: 10,
    band: 'MEDIUM_HIGH',
    reason: 'Especially important for villages and farming communities',
  },
  {
    code: 'ENVIRONMENT',
    name: 'Environment',
    nameHi: 'पर्यावरण',
    nameBho: 'पर्यावरण',
    priority: 11,
    band: 'MEDIUM',
    reason: 'Pollution, waste dumping, tree cutting, water pollution',
  },
  {
    code: 'WOMEN_CHILD_WELFARE',
    name: 'Women & Child Welfare',
    nameHi: 'महिला एवं बाल कल्याण',
    nameBho: 'महिला आ बच्चा कल्याण',
    priority: 12,
    band: 'MEDIUM_HIGH',
    reason: 'Important welfare and safety-related issues',
  },
  {
    code: 'OTHER',
    name: 'Other',
    nameHi: 'अन्य',
    nameBho: 'अउर',
    priority: 13,
    band: 'OTHER',
    reason: 'Catch-all for issues outside defined categories',
  },
] as const;

export async function seedPostIssues(prisma: PrismaClient) {
  for (const issue of POST_ISSUES) {
    await prisma.postIssue.upsert({
      where: { code: issue.code },
      update: {
        name: issue.name,
        nameHi: issue.nameHi,
        nameBho: issue.nameBho,
        priority: issue.priority,
        band: issue.band,
        reason: issue.reason,
      },
      create: issue,
    });
  }
  const now = new Date();
  await prisma.postIssueSync.upsert({
    where: { id: 1 },
    update: { updatedAt: now },
    create: { id: 1, updatedAt: now },
  });
}
