import {
  Gender,
  HealthBand,
  LocaleCode,
  MemberStatus,
  PointSource,
  PostType,
  PrismaClient,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { seedOrgHierarchy } from './seed-org-hierarchy.js';
import { upsertIndiaGeo } from './upsert-india-geo.js';

const prisma = new PrismaClient();

function hashMobile(mobileE164: string) {
  return createHash('sha256').update(mobileE164).digest('hex');
}

function membershipNumberFromRowId(rowId: number) {
  return `RPD-${rowId}`;
}

async function main() {
  await prisma.pointLedgerEntry.deleteMany();
  await prisma.activityReview.deleteMany();
  await prisma.activityPhoto.deleteMany();
  await prisma.activityAttendee.deleteMany();
  await prisma.meetingCheckIn.deleteMany();
  await prisma.meetingInvitee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.memberConsent.deleteMany();
  await prisma.consentDocument.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.membershipCard.deleteMany();
  await prisma.memberPost.deleteMany();
  await prisma.boothHealthComponent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.syncIdempotency.deleteMany();
  await prisma.member.deleteMany();
  await prisma.booth.deleteMany();
  await prisma.mandal.deleteMany();
  await prisma.assemblyConstituency.deleteMany();
  await prisma.district.deleteMany();
  await prisma.region.deleteMany();
  await prisma.orgPost.deleteMany();
  await prisma.orgLevel.deleteMany();
  await prisma.state.deleteMany();
  await prisma.pointRule.deleteMany();

  await seedOrgHierarchy(prisma);
  await upsertIndiaGeo(prisma);
  const up = await prisma.state.findUniqueOrThrow({ where: { code: 'UP' } });
  const west = await prisma.region.upsert({
    where: { stateId_code: { stateId: up.id, code: 'WEST' } },
    update: { name: 'West Uttar Pradesh', nameHi: 'पश्चिमी उत्तर प्रदेश' },
    create: { stateId: up.id, code: 'WEST', name: 'West Uttar Pradesh', nameHi: 'पश्चिमी उत्तर प्रदेश' },
  });
  const district = await prisma.district.findFirstOrThrow({ where: { name: 'Ghaziabad' } });
  await prisma.district.update({ where: { id: district.id }, data: { regionId: west.id } });
  const assembly = await prisma.assemblyConstituency.findFirstOrThrow({
    where: { name: 'Ghaziabad', districtId: district.id },
  });
  const mandal = await prisma.mandal.create({
    data: {
      districtId: district.id,
      assemblyId: assembly.id,
      code: 'SIHANI',
      name: 'Sihani',
      nameHi: 'सिहानी',
    },
  });

  const boothSeeds = [
    { code: 'B045', n: '045', part: '132', name: 'Primary School, Sihani', land: 'Primary School', vil: 'Sihani', pin: '201001', voters: 1240, members: 182, lat: 28.6692000, lng: 77.4538000, score: 68, band: HealthBand.ATTENTION },
    { code: 'B046', n: '046', part: '133', name: 'Panchayat Bhawan', land: 'Panchayat Bhawan', vil: 'Sihani', pin: '201001', voters: 1105, members: 96, lat: 28.6704000, lng: 77.4552000, score: 72, band: HealthBand.ATTENTION },
    { code: 'B044', n: '044', part: '131', name: 'Community Hall', land: 'Community Hall', vil: 'Sihani', pin: '201001', voters: 980, members: 88, lat: 28.6671000, lng: 77.4519000, score: 61, band: HealthBand.ATTENTION },
    { code: 'B047', n: '047', part: '134', name: 'Govt Inter College', land: 'GIC Gate', vil: 'Sihani', pin: '201001', voters: 1510, members: 210, lat: 28.6728000, lng: 77.4496000, score: 81, band: HealthBand.STRONG },
    { code: 'B112', n: '112', part: '201', name: 'Block Office Camp', land: 'Block Office', vil: 'Loni', pin: '201102', voters: 1890, members: 41, lat: 28.7512000, lng: 77.2884000, score: 22, band: HealthBand.WEAK },
    { code: 'B048', n: '048', part: '135', name: 'Anganwadi Kendra', land: 'Anganwadi', vil: 'Sihani', pin: '201001', voters: 870, members: 70, lat: 28.6654000, lng: 77.4571000, score: 74, band: HealthBand.STRONG },
    { code: 'B049', n: '049', part: '136', name: 'Temple Courtyard', land: 'Shiv Mandir', vil: 'Sihani', pin: '201001', voters: 1020, members: 91, lat: 28.6680000, lng: 77.4602000, score: 77, band: HealthBand.STRONG },
    { code: 'B050', n: '050', part: '137', name: 'Railway Colony School', land: 'Railway Colony', vil: 'Ghaziabad', pin: '201001', voters: 1340, members: 120, lat: 28.6618000, lng: 77.4465000, score: 69, band: HealthBand.ATTENTION },
  ];

  const booths = [];
  for (const b of boothSeeds) {
    booths.push(
      await prisma.booth.create({
        data: {
          districtId: district.id,
          assemblyId: assembly.id,
          mandalId: mandal.id,
          code: b.code,
          boothNumber: b.n,
          partNumber: b.part,
          name: b.name,
          landmark: b.land,
          village: b.vil,
          pincode: b.pin,
          voterCount: b.voters,
          memberCount: b.members,
          latitude: b.lat,
          longitude: b.lng,
          healthScore: b.score,
          healthBand: b.band,
          lastActivityAt: new Date('2026-08-29T18:00:00+05:30'),
        },
      }),
    );
  }
  const b045 = booths[0]!;
  const b112 = booths[4]!;

  await prisma.boothHealthComponent.createMany({
    data: [
      { boothId: b045.id, key: 'committee', label: 'Committee formed', score: 25, maxScore: 25, detail: '25 of 25 points · all 11 posts filled' },
      { boothId: b045.id, key: 'panna', label: 'Panna Pramukhs appointed', score: 9, maxScore: 25, detail: '9 of 25 points · only 4 of 11 pages covered' },
      { boothId: b045.id, key: 'members', label: 'Members against voters', score: 14, maxScore: 20, detail: '14 of 20 points · 182 members, 1,240 voters' },
      { boothId: b045.id, key: 'activity', label: 'Recent activity', score: 20, maxScore: 20, detail: '20 of 20 points · last verified 2 days ago' },
    ],
  });

  const consentBodies = {
    HI: 'आपका नाम, मोबाइल, जन्म तिथि, पता और बूथ इसलिए ताकि संगठन सदस्यता पंजी रख सके। सक्रिय सदस्यता के तीन वर्ष बाद तक रखा जाता है। शिकायत अधिकारी: privacy@party.in',
    EN: 'Your name, mobile number, date of birth, address and booth, so the party can maintain its membership register and assign you to a committee. We keep this while your membership is active and for three years after. Grievance officer: privacy@party.in',
    BHO: 'राउर नाम, मोबाइल, जनम तिथि, पता आ बूथ ताकि संगठन सदस्यता रजिस्टर रख सके। सक्रिय सदस्यता के तीन साल बाद तक रखल जाला। शिकायत अधिकारी: privacy@party.in',
  } as const;

  for (const locale of [LocaleCode.HI, LocaleCode.EN, LocaleCode.BHO]) {
    await prisma.consentDocument.create({
      data: {
        version: `2026.08-${locale}`,
        kind: 'MEMBERSHIP_REQUIRED',
        locale,
        title: 'What we collect and why',
        body: consentBodies[locale],
        isCurrent: true,
      },
    });
    await prisma.consentDocument.create({
      data: {
        version: `2026.08-wa-${locale}`,
        kind: 'WHATSAPP_UPDATES',
        locale,
        title: 'WhatsApp updates',
        body: 'Optional party updates on WhatsApp. You can change this later.',
        isCurrent: true,
      },
    });
  }

  await prisma.pointRule.createMany({
    data: [
      { source: PointSource.MEMBER_VERIFIED, points: 10, unitLabel: 'member' },
      { source: PointSource.MEETING_HELD, points: 25, unitLabel: 'meeting' },
      { source: PointSource.GRIHA_SAMPARK, points: 15, unitLabel: '10 homes' },
      { source: PointSource.PENALTY, points: 50, unitLabel: 'repeat case' },
    ],
  });

  const suresh = await prisma.member.create({
    data: {
      mobileE164: '+919876543210',
      mobileHash: hashMobile('+919876543210'),
      fullName: 'Suresh Kumar Yadav',
      dateOfBirth: new Date('1988-03-14'),
      gender: Gender.MALE,
      locale: LocaleCode.HI,
      status: MemberStatus.VERIFIED,
      whatsappOptIn: true,
      validTo: new Date('2028-03-31'),
      districtId: district.id,
      assemblyId: assembly.id,
      mandalId: mandal.id,
      boothId: b045.id,
      lastActiveAt: new Date('2026-08-29T18:10:00+05:30'),
    },
  });
  await prisma.member.update({
    where: { id: suresh.id },
    data: { membershipNumber: membershipNumberFromRowId(suresh.rowId) },
  });

  const rajesh = await prisma.member.create({
    data: {
      mobileE164: '+919811112222',
      mobileHash: hashMobile('+919811112222'),
      fullName: 'Rajesh Sharma',
      gender: Gender.MALE,
      locale: LocaleCode.HI,
      status: MemberStatus.VERIFIED,
      validTo: new Date('2028-03-31'),
      districtId: district.id,
      assemblyId: assembly.id,
      mandalId: mandal.id,
      boothId: b045.id,
    },
  });
  await prisma.member.update({
    where: { id: rajesh.id },
    data: { membershipNumber: membershipNumberFromRowId(rajesh.rowId) },
  });

  await prisma.memberPost.createMany({
    data: [
      { memberId: suresh.id, post: PostType.PANNA_PRAMUKH, boothId: b045.id, pageNumber: 4, isPrimary: true },
      { memberId: rajesh.id, post: PostType.MANDAL_PRESIDENT, mandalId: mandal.id, isPrimary: true },
    ],
  });

  await prisma.membershipCard.create({
    data: {
      memberId: suresh.id,
      publicCode: membershipNumberFromRowId(suresh.rowId),
      validTo: new Date('2028-03-31'),
    },
  });

  const recruits = [
    { name: 'Ramesh Chandra', mobile: '+919900000004', status: MemberStatus.PENDING, boothId: b045.id },
    { name: 'Sunita Devi', mobile: '+919900000005', status: MemberStatus.VERIFIED, boothId: b045.id },
    { name: 'Mohd Irfan', mobile: '+919900000006', status: MemberStatus.VERIFIED, boothId: b045.id },
    { name: 'Kamal Prasad', mobile: '+919900000007', status: MemberStatus.REJECTED, boothId: b112.id },
    { name: 'Geeta Singh', mobile: '+919900000008', status: MemberStatus.VERIFIED, boothId: b045.id },
  ];

  const createdRecruits = [];
  for (const r of recruits) {
    const recruit = await prisma.member.create({
      data: {
        mobileE164: r.mobile,
        mobileHash: hashMobile(r.mobile),
        fullName: r.name,
        status: r.status,
        locale: LocaleCode.HI,
        gender: Gender.UNDISCLOSED,
        districtId: district.id,
        assemblyId: assembly.id,
        mandalId: mandal.id,
        boothId: r.boothId,
        recruitedById: suresh.id,
        validTo: new Date('2028-03-31'),
      },
    });
    await prisma.member.update({
      where: { id: recruit.id },
      data: { membershipNumber: membershipNumberFromRowId(recruit.rowId) },
    });
    createdRecruits.push(recruit);
  }

  const now = new Date();
  await prisma.task.createMany({
    data: [
      {
        assigneeId: suresh.id,
        assignerId: rajesh.id,
        boothId: b045.id,
        title: 'Submit booth committee list',
        detail: 'From Rajesh Sharma, Mandal President',
        status: 'OVERDUE',
        priority: 'OVERDUE',
        dueAt: new Date(now.getTime() - 2 * 86400000),
      },
      {
        assigneeId: suresh.id,
        assignerId: rajesh.id,
        boothId: b045.id,
        title: 'Griha sampark · 50 homes',
        detail: '30 done · from Mandal President',
        status: 'OPEN',
        priority: 'TODAY',
        progress: 30,
        target: 50,
        dueAt: now,
      },
      {
        assigneeId: suresh.id,
        assignerId: suresh.id,
        boothId: b045.id,
        title: 'Appoint 3 Panna Pramukhs',
        detail: 'Pages 5, 6, 7 · from Booth Adhyaksh',
        status: 'OPEN',
        priority: 'TODAY',
        progress: 0,
        target: 3,
        dueAt: now,
      },
      {
        assigneeId: suresh.id,
        assignerId: rajesh.id,
        boothId: b045.id,
        title: 'Attend booth training',
        detail: 'Due 4 Sep · online module',
        status: 'OPEN',
        priority: 'THIS_WEEK',
        dueAt: new Date('2026-09-04T10:00:00+05:30'),
      },
      {
        assigneeId: suresh.id,
        assignerId: rajesh.id,
        boothId: b045.id,
        title: 'Verify 6 pending members',
        detail: 'Due 5 Sep',
        status: 'OPEN',
        priority: 'THIS_WEEK',
        dueAt: new Date('2026-09-05T10:00:00+05:30'),
      },
    ],
  });

  const meetingActivity = await prisma.activity.create({
    data: {
      clientUuid: '018f1a2b-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
      actorId: suresh.id,
      boothId: b045.id,
      type: 'MEETING',
      status: 'NOT_VERIFIED',
      occurredAt: new Date('2026-08-28T16:19:00+05:30'),
      notes: 'Booth committee meeting',
      latitude: 28.6692,
      longitude: 77.4538,
      distanceMetres: 180,
      attendeeCount: 14,
      photoCount: 2,
    },
  });

  await prisma.activityReview.create({
    data: {
      activityId: meetingActivity.id,
      reviewerId: rajesh.id,
      decision: 'NOT_VERIFIED',
      reason:
        'This photograph was also submitted for the meeting on 22 August. Please attach a photo from this meeting.',
    },
  });

  await prisma.activity.create({
    data: {
      clientUuid: '018f1a2b-3c4d-7e8f-9a0b-1c2d3e4f5a6c',
      actorId: suresh.id,
      boothId: b045.id,
      type: 'MEETING',
      status: 'VERIFIED',
      occurredAt: new Date('2026-08-29T18:00:00+05:30'),
      notes: 'Booth meeting',
      distanceMetres: 40,
      attendeeCount: 12,
    },
  });

  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  await prisma.pointLedgerEntry.createMany({
    data: [
      { memberId: suresh.id, source: 'MEMBER_VERIFIED', direction: 'CREDIT', points: 220, pending: false, note: 'Members verified · 22', periodMonth: month },
      { memberId: suresh.id, source: 'MEETING_HELD', direction: 'CREDIT', points: 125, pending: false, note: 'Meetings held · 5', periodMonth: month },
      { memberId: suresh.id, source: 'GRIHA_SAMPARK', direction: 'CREDIT', points: 135, pending: false, note: 'Griha sampark · 90 homes', periodMonth: month },
      { memberId: suresh.id, source: 'PENALTY', direction: 'DEBIT', points: 50, pending: false, note: 'Activity not verified · photo already used elsewhere', periodMonth: month },
    ],
  });

  const meeting = await prisma.meeting.create({
    data: {
      boothId: b045.id,
      hostId: suresh.id,
      title: 'Booth committee meeting',
      agenda: '1. Membership drive review\n2. Panna Pramukh appointments\n3. Sampark programme dates',
      startsAt: new Date('2026-08-31T18:00:00+05:30'),
      venue: 'Primary School, Sihani',
      status: 'SCHEDULED',
    },
  });

  await prisma.meetingInvitee.createMany({
    data: createdRecruits.slice(0, 3).map((m, i) => ({
      meetingId: meeting.id,
      memberId: m.id,
      postLabel: ['Booth Adhyaksh', 'Mahila Morcha', 'Panna Pramukh, page 4'][i]!,
    })),
  });

  await prisma.nearbyActivityCard.deleteMany();
  await prisma.nearbyActivityCard.createMany({
    data: [
      {
        title: 'Booth meeting',
        placeLabel: 'Near your booth',
        imageUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=60',
        sortOrder: 1,
      },
      {
        title: 'Griha sampark',
        placeLabel: 'Ward walk',
        imageUrl: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=800&q=60',
        sortOrder: 2,
      },
      {
        title: 'Public programme',
        placeLabel: 'Community hall',
        imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=60',
        sortOrder: 3,
      },
    ],
  });

  console.log('Seeded RPD demo data');
  console.log('  Demo login: 9876543210 / OTP 123456');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
