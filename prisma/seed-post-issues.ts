import type { PrismaClient } from '@prisma/client';

type Child = { code: string; name: string; nameHi: string };
type Category = {
  code: string;
  name: string;
  nameHi: string;
  priority: number;
  band: string;
  reason: string;
  children: Child[];
};

const POST_ISSUE_TREE: Category[] = [
  {
    code: 'LAND',
    name: 'Land and revenue',
    nameHi: 'ज़मीन और राजस्व',
    priority: 1,
    band: 'VERY_HIGH',
    reason: 'The biggest category in villages: ownership, records, mutation and compensation',
    children: [
      { code: 'LAND_DISPUTE', name: 'Dispute over land ownership', nameHi: 'ज़मीन का विवाद' },
      { code: 'LAND_ENCROACHMENT', name: 'Someone has occupied our land', nameHi: 'ज़मीन पर कब्ज़ा' },
      { code: 'COMMON_LAND_GRAB', name: 'Village common land taken over', nameHi: 'गाँव की सरकारी ज़मीन पर अतिक्रमण' },
      { code: 'BOUNDARY', name: 'Land measurement or boundary marking needed', nameHi: 'पैमाइश / सीमांकन' },
      { code: 'MUTATION', name: 'Name not changed in land records', nameHi: 'दाखिल-खारिज नहीं हुआ' },
      { code: 'LAND_RECORD_ERROR', name: 'Wrong entry in khatauni or khasra', nameHi: 'खतौनी में गलती' },
      { code: 'PARTITION', name: 'Family land division not done', nameHi: 'बंटवारा' },
      { code: 'LEKHPAL', name: 'Lekhpal or tehsil office not helping', nameHi: 'लेखपाल / तहसील की शिकायत' },
      { code: 'COMPENSATION', name: 'Land taken for road or project, payment not received', nameHi: 'मुआवजा नहीं मिला' },
    ],
  },
  {
    code: 'WATER',
    name: 'Drinking water',
    nameHi: 'पेयजल',
    priority: 2,
    band: 'VERY_HIGH',
    reason: 'Handpumps, pipelines, dirty water and summer shortage',
    children: [
      { code: 'HANDPUMP_BROKEN', name: 'Handpump not working', nameHi: 'हैंडपंप खराब' },
      { code: 'HANDPUMP_NEEDED', name: 'New handpump needed', nameHi: 'नया हैंडपंप चाहिए' },
      { code: 'WATER_DIRTY', name: 'Water is dirty or smells', nameHi: 'पानी गंदा आ रहा है' },
      { code: 'PIPELINE', name: 'Tap water pipeline not laid or leaking', nameHi: 'पाइपलाइन की समस्या' },
      { code: 'TANK_MOTOR', name: 'Water tank or motor not working', nameHi: 'टंकी / मोटर खराब' },
      { code: 'WATER_SHORTAGE', name: 'No water in summer', nameHi: 'गर्मी में पानी की कमी' },
    ],
  },
  {
    code: 'POWER',
    name: 'Electricity',
    nameHi: 'बिजली',
    priority: 3,
    band: 'VERY_HIGH',
    reason: 'Transformers, poles, supply hours, bills and street lights',
    children: [
      { code: 'TRANSFORMER', name: 'Transformer burnt or not repaired', nameHi: 'ट्रांसफार्मर खराब' },
      { code: 'POLE_WIRE', name: 'Pole broken or wires hanging low', nameHi: 'खंभा / तार लटका हुआ' },
      { code: 'NO_SUPPLY', name: 'Very few hours of electricity', nameHi: 'बिजली नहीं आती' },
      { code: 'WRONG_BILL', name: 'Wrong or inflated bill', nameHi: 'गलत बिल' },
      { code: 'NEW_CONNECTION', name: 'New connection not given', nameHi: 'नया कनेक्शन नहीं मिला' },
      { code: 'STREET_LIGHT', name: 'Street light not working', nameHi: 'स्ट्रीट लाइट खराब' },
    ],
  },
  {
    code: 'ROAD_SANITATION',
    name: 'Roads, drains and sanitation',
    nameHi: 'सड़क, नाली और सफाई',
    priority: 4,
    band: 'VERY_HIGH',
    reason: 'Broken roads, blocked drains, garbage and waterlogging',
    children: [
      { code: 'ROAD_BROKEN', name: 'Road broken or full of potholes', nameHi: 'सड़क टूटी है' },
      { code: 'ROAD_NOT_BUILT', name: 'Sanctioned road never built', nameHi: 'मंज़ूर सड़क नहीं बनी' },
      { code: 'KHARANJA', name: 'Village lane needs brick paving', nameHi: 'खड़ंजा / गली का काम' },
      { code: 'DRAIN', name: 'Drain blocked or overflowing', nameHi: 'नाली जाम / गंदा पानी' },
      { code: 'WATERLOGGING', name: 'Water fills up in rain', nameHi: 'जलभराव' },
      { code: 'GARBAGE', name: 'Garbage not cleared', nameHi: 'कूड़ा नहीं उठता' },
      { code: 'CULVERT_BRIDGE', name: 'Culvert or small bridge broken', nameHi: 'पुलिया टूटी है' },
    ],
  },
  {
    code: 'RATION',
    name: 'Ration and food',
    nameHi: 'राशन',
    priority: 5,
    band: 'HIGH',
    reason: 'Ration cards, grain quota, dealer shops and e-KYC',
    children: [
      { code: 'RATION_CARD_NEW', name: 'Ration card not made', nameHi: 'राशन कार्ड नहीं बना' },
      { code: 'NAME_MISSING', name: "Family member's name missing", nameHi: 'नाम नहीं जुड़ा' },
      { code: 'CARD_CANCELLED', name: 'Card cancelled without reason', nameHi: 'कार्ड कट गया' },
      { code: 'LESS_GRAIN', name: 'Dealer gives less than the quota', nameHi: 'कम राशन मिलता है' },
      { code: 'DEALER_SHOP', name: 'Shop stays shut or dealer misbehaves', nameHi: 'कोटेदार की शिकायत' },
      { code: 'EKYC', name: 'Aadhaar or e-KYC problem on the card', nameHi: 'ई-केवाईसी की दिक्कत' },
    ],
  },
  {
    code: 'PENSION',
    name: 'Pension and welfare payments',
    nameHi: 'पेंशन',
    priority: 6,
    band: 'HIGH',
    reason: 'Old-age, widow and disability pensions and bank credit',
    children: [
      { code: 'OLD_AGE', name: 'Old-age pension not coming', nameHi: 'वृद्धावस्था पेंशन नहीं आ रही' },
      { code: 'WIDOW', name: 'Widow pension not coming', nameHi: 'विधवा पेंशन' },
      { code: 'DISABILITY', name: 'Disability pension not coming', nameHi: 'दिव्यांग पेंशन' },
      { code: 'PENSION_NEW', name: 'Pension application not approved', nameHi: 'पेंशन आवेदन लंबित' },
      { code: 'BANK_ISSUE', name: 'Money not reaching the bank account', nameHi: 'खाते में पैसा नहीं आया' },
    ],
  },
  {
    code: 'NREGA',
    name: 'MGNREGA and work',
    nameHi: 'मनरेगा',
    priority: 7,
    band: 'HIGH',
    reason: 'Job cards, wages, work availability and fake muster rolls',
    children: [
      { code: 'JOB_CARD', name: 'Job card not made', nameHi: 'जॉब कार्ड नहीं बना' },
      { code: 'CARD_WITHHELD', name: 'Someone else is holding my job card', nameHi: 'जॉब कार्ड किसी और के पास है' },
      { code: 'NO_WORK', name: 'No work being given', nameHi: 'काम नहीं मिल रहा' },
      { code: 'WAGE_DELAY', name: 'Wages not paid', nameHi: 'मजदूरी नहीं मिली' },
      { code: 'MUSTER_FAKE', name: 'Names of people who never worked', nameHi: 'फर्जी हाजिरी' },
      { code: 'WORK_NOT_DONE', name: 'Work shown on paper, nothing on ground', nameHi: 'कागज़ पर काम, ज़मीन पर नहीं' },
    ],
  },
  {
    code: 'HOUSING',
    name: 'Housing and toilets',
    nameHi: 'आवास और शौचालय',
    priority: 8,
    band: 'HIGH',
    reason: 'PM Awas sanctions, instalments and toilets',
    children: [
      { code: 'AWAS_NOT_GIVEN', name: 'House under PM Awas not sanctioned', nameHi: 'आवास नहीं मिला' },
      { code: 'AWAS_INSTALMENT', name: 'Instalment not received', nameHi: 'किस्त नहीं आई' },
      { code: 'LIST_WRONG', name: 'Eligible person left off the list', nameHi: 'पात्र का नाम सूची में नहीं' },
      { code: 'TOILET_NOT_BUILT', name: 'Toilet money received, not built', nameHi: 'शौचालय नहीं बना' },
      { code: 'TOILET_NEEDED', name: 'Toilet needed', nameHi: 'शौचालय चाहिए' },
    ],
  },
  {
    code: 'HEALTH',
    name: 'Health',
    nameHi: 'स्वास्थ्य',
    priority: 9,
    band: 'VERY_HIGH',
    reason: 'PHC, medicines, ASHA/ANM, ambulance and Ayushman',
    children: [
      { code: 'PHC_CLOSED', name: 'Health centre closed or doctor absent', nameHi: 'अस्पताल बंद / डॉक्टर नहीं' },
      { code: 'NO_MEDICINE', name: 'Medicines not available', nameHi: 'दवा नहीं मिलती' },
      { code: 'ASHA_ANM', name: 'ASHA or ANM not visiting', nameHi: 'आशा / एएनएम नहीं आतीं' },
      { code: 'AMBULANCE', name: 'Ambulance did not come', nameHi: 'एम्बुलेंस नहीं आई' },
      { code: 'AYUSHMAN', name: 'Ayushman card not made or not accepted', nameHi: 'आयुष्मान कार्ड की समस्या' },
      { code: 'VACCINATION', name: 'Vaccination camp not held', nameHi: 'टीकाकरण नहीं हुआ' },
    ],
  },
  {
    code: 'EDUCATION',
    name: 'Education and Anganwadi',
    nameHi: 'शिक्षा और आंगनबाड़ी',
    priority: 10,
    band: 'HIGH',
    reason: 'Teachers, school buildings, mid-day meals, anganwadi and scholarships',
    children: [
      { code: 'TEACHER_ABSENT', name: 'Teacher does not come', nameHi: 'शिक्षक नहीं आते' },
      { code: 'SCHOOL_BUILDING', name: 'School building broken, no boundary wall', nameHi: 'स्कूल की इमारत खराब' },
      { code: 'MID_DAY_MEAL', name: 'Mid-day meal not given or poor quality', nameHi: 'मध्याह्न भोजन की शिकायत' },
      { code: 'ANGANWADI', name: 'Anganwadi closed or ration not given', nameHi: 'आंगनबाड़ी बंद / पोषाहार नहीं' },
      { code: 'SCHOLARSHIP', name: 'Scholarship not received', nameHi: 'छात्रवृत्ति नहीं मिली' },
      { code: 'ADMISSION', name: 'Admission refused', nameHi: 'दाखिला नहीं मिला' },
    ],
  },
  {
    code: 'FARMING',
    name: 'Farming and irrigation',
    nameHi: 'खेती और सिंचाई',
    priority: 11,
    band: 'MEDIUM_HIGH',
    reason: 'Canal water, tubewells, fertiliser, crop insurance and stray cattle',
    children: [
      { code: 'CANAL', name: 'Canal water not reaching fields', nameHi: 'नहर में पानी नहीं' },
      { code: 'TUBEWELL', name: 'Government tubewell not working', nameHi: 'राजकीय नलकूप खराब' },
      { code: 'FERTILIZER', name: 'Fertiliser or seed not available, or black-marketed', nameHi: 'खाद / बीज नहीं मिल रहा' },
      { code: 'CROP_INSURANCE', name: 'Crop insurance claim not paid', nameHi: 'फसल बीमा नहीं मिला' },
      { code: 'CROP_DAMAGE', name: 'Crop damaged by rain, hail or flood', nameHi: 'फसल का नुकसान' },
      { code: 'STRAY_CATTLE', name: 'Stray cattle destroying crops', nameHi: 'छुट्टा पशु फसल खा रहे हैं' },
      { code: 'MANDI_PAYMENT', name: 'Payment pending after selling at the mandi', nameHi: 'मंडी में भुगतान बाकी' },
    ],
  },
  {
    code: 'DOCUMENTS',
    name: 'Certificates and documents',
    nameHi: 'प्रमाण पत्र',
    priority: 12,
    band: 'HIGH',
    reason: 'Caste, income, domicile, birth/death certificates and Aadhaar',
    children: [
      { code: 'CASTE_CERT', name: 'Caste certificate not made', nameHi: 'जाति प्रमाण पत्र' },
      { code: 'INCOME_CERT', name: 'Income certificate not made', nameHi: 'आय प्रमाण पत्र' },
      { code: 'RESIDENCE_CERT', name: 'Domicile certificate not made', nameHi: 'निवास प्रमाण पत्र' },
      { code: 'BIRTH_DEATH', name: 'Birth or death certificate not made', nameHi: 'जन्म / मृत्यु प्रमाण पत्र' },
      { code: 'AADHAAR', name: 'Aadhaar correction or update', nameHi: 'आधार में सुधार' },
    ],
  },
  {
    code: 'COMMON_PROPERTY',
    name: 'Village common property',
    nameHi: 'गाँव की साझी संपत्ति',
    priority: 13,
    band: 'MEDIUM_HIGH',
    reason: 'Ponds, grazing land, cremation ground, panchayat bhavan and playgrounds',
    children: [
      { code: 'POND', name: 'Village pond encroached or dried up', nameHi: 'तालाब पर कब्ज़ा' },
      { code: 'GRAZING_LAND', name: 'Grazing land occupied', nameHi: 'चरागाह पर कब्ज़ा' },
      { code: 'CREMATION', name: 'No cremation or burial ground', nameHi: 'श्मशान / कब्रिस्तान नहीं' },
      { code: 'PANCHAYAT_BHAWAN', name: 'Panchayat building unusable', nameHi: 'पंचायत भवन खराब' },
      { code: 'PLAYGROUND', name: 'No playground or park', nameHi: 'खेल का मैदान नहीं' },
    ],
  },
  {
    code: 'GOVERNANCE',
    name: 'Governance and conduct',
    nameHi: 'शासन और आचरण',
    priority: 14,
    band: 'HIGH',
    reason: 'Bribes, fund misuse, gram sabha, officials, liquor, transport and network',
    children: [
      { code: 'BRIBE', name: 'Money demanded for government work', nameHi: 'रिश्वत माँगी गई' },
      { code: 'FUND_MISUSE', name: 'Panchayat funds not spent properly', nameHi: 'पंचायत के पैसे का दुरुपयोग' },
      { code: 'NO_GRAM_SABHA', name: 'Gram Sabha meeting not held', nameHi: 'ग्राम सभा नहीं हुई' },
      { code: 'OFFICIAL_ABSENT', name: 'Secretary or official never available', nameHi: 'सचिव / कर्मचारी नहीं मिलते' },
      { code: 'ILLEGAL_LIQUOR', name: 'Illegal liquor being sold', nameHi: 'अवैध शराब' },
      { code: 'TRANSPORT', name: 'No bus service or bad connectivity', nameHi: 'बस सेवा नहीं' },
      { code: 'NETWORK', name: 'No mobile network', nameHi: 'मोबाइल नेटवर्क नहीं' },
    ],
  },
];

const keepCodes = new Set(POST_ISSUE_TREE.flatMap((cat) => [cat.code, ...cat.children.map((child) => child.code)]));

export async function seedPostIssues(prisma: PrismaClient) {
  for (const category of POST_ISSUE_TREE) {
    const parent = await prisma.postIssue.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        nameHi: category.nameHi,
        nameBho: category.nameHi,
        priority: category.priority,
        sortOrder: 0,
        band: category.band,
        reason: category.reason,
        parentId: null,
      },
      create: {
        code: category.code,
        name: category.name,
        nameHi: category.nameHi,
        nameBho: category.nameHi,
        priority: category.priority,
        sortOrder: 0,
        band: category.band,
        reason: category.reason,
      },
    });
    for (const [index, child] of category.children.entries()) {
      await prisma.postIssue.upsert({
        where: { code: child.code },
        update: {
          name: child.name,
          nameHi: child.nameHi,
          nameBho: child.nameHi,
          priority: category.priority,
          sortOrder: index + 1,
          band: category.band,
          reason: child.name,
          parentId: parent.id,
        },
        create: {
          code: child.code,
          name: child.name,
          nameHi: child.nameHi,
          nameBho: child.nameHi,
          priority: category.priority,
          sortOrder: index + 1,
          band: category.band,
          reason: child.name,
          parentId: parent.id,
        },
      });
    }
  }

  const stale = await prisma.postIssue.findMany({
    where: { code: { notIn: [...keepCodes] } },
    select: { id: true, code: true },
  });
  if (stale.length) {
    const fallback = await prisma.postIssue.findUnique({ where: { code: 'LAND' } });
    const firstChild = await prisma.postIssue.findFirst({ where: { parentId: fallback?.id ?? undefined }, orderBy: { sortOrder: 'asc' } });
    if (fallback) {
      await prisma.regionPost.updateMany({
        where: { issueId: { in: stale.map((row) => row.id) } },
        data: { issueId: fallback.id, subIssueId: firstChild?.id ?? null },
      });
    }
    await prisma.postIssue.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }

  const now = new Date();
  await prisma.postIssueSync.upsert({
    where: { id: 1 },
    update: { updatedAt: now },
    create: { id: 1, updatedAt: now },
  });
}
