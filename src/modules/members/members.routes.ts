import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { hashMobile } from '../../lib/crypto.js';
import { membershipNumberFromRowId, persistMembershipNumber, stateCodeForId } from '../../lib/membership.js';
import { parseIsoDate } from '../../lib/date.js';
import { mediaPublicUrl, putMemberPhoto } from '../../lib/storage.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { photoUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { serializeMember } from './member.serialize.js';

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
  .refine((value) => {
    try {
      parseIsoDate(value);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid date of birth as YYYY-MM-DD');

const registerFields = z.object({
  fullName: z.string().trim().min(2).max(160),
  dateOfBirth: isoDate,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']),
  boothId: z.string().uuid().nullish(),
  assemblyId: z.string().uuid().nullish(),
  locale: z.enum(['HI', 'EN', 'BHO']).default('HI'),
  requiredConsentVersion: z.string().min(1),
  whatsappOptIn: z.boolean().default(false),
  photoUrl: z.string().min(1).nullish(),
  address: z.string().trim().min(3).max(400).nullish(),
  pincode: z.string().regex(/^\d{6}$/).nullish(),
});

const registerSchema = registerFields.refine((value) => Boolean(value.boothId || value.assemblyId), {
  message: 'Select an assembly constituency',
});

const recruitSchema = registerFields.extend({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  boothId: z.string().uuid().optional(),
});

const recruitGraph = {
  booth: true,
  posts: { where: { endedAt: null } },
  recruitedBy: { select: { id: true, fullName: true, membershipNumber: true, rowId: true } },
} as const;

async function recruitsPayload(recruiterId: string) {
  const recruits = await prisma.member.findMany({
    where: { recruitedById: recruiterId, deletedAt: null },
    include: { booth: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return {
    counts: {
      verified: recruits.filter((r) => r.status === 'VERIFIED').length,
      pending: recruits.filter((r) => r.status === 'PENDING').length,
      rejected: recruits.filter((r) => r.status === 'REJECTED').length,
    },
    recruits: recruits.map((r) => serializeMember(r)),
  };
}

export const membersRouter = Router();
membersRouter.use(requireAuth);

const memberGraph = {
  booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } },
  state: true,
  district: true,
  assembly: true,
  posts: true,
  card: true,
} as const;

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  dateOfBirth: isoDate.optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional(),
  address: z.string().trim().max(400).nullish(),
  pincode: z
    .string()
    .trim()
    .refine((value) => value.length === 0 || /^\d{6}$/.test(value), 'Enter a 6-digit pincode')
    .nullish(),
  boothId: z.string().uuid().nullish(),
  assemblyId: z.string().uuid().nullish(),
});

membersRouter.patch('/me', validate(updateProfileSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof updateProfileSchema>;
  const data: {
    fullName?: string;
    dateOfBirth?: Date;
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
    address?: string | null;
    pincode?: string | null;
    boothId?: string | null;
    mandalId?: string | null;
    assemblyId?: string | null;
    districtId?: string | null;
    regionId?: string | null;
    stateId?: string | null;
  } = {};

  if (body.fullName) data.fullName = body.fullName;
  if (body.dateOfBirth) data.dateOfBirth = parseIsoDate(body.dateOfBirth);
  if (body.gender) data.gender = body.gender;
  if (body.address !== undefined) data.address = body.address?.trim() || null;
  if (body.pincode !== undefined) data.pincode = body.pincode?.trim() || null;

  if (body.boothId || body.assemblyId) {
    const booth = body.boothId
      ? await prisma.booth.findFirst({ where: { id: body.boothId, deletedAt: null } })
      : body.assemblyId
        ? await prisma.booth.findFirst({ where: { assemblyId: body.assemblyId, deletedAt: null }, orderBy: { boothNumber: 'asc' } })
        : null;
    const assembly = body.assemblyId
      ? await prisma.assemblyConstituency.findFirst({ where: { id: body.assemblyId } })
      : booth?.assemblyId
        ? await prisma.assemblyConstituency.findFirst({ where: { id: booth.assemblyId } })
        : null;
    if (!booth && !assembly) throw notFound('Assembly not found');
    const districtId = assembly?.districtId ?? booth?.districtId ?? null;
    const district = districtId ? await prisma.district.findFirst({ where: { id: districtId } }) : null;
    data.boothId = booth?.id ?? null;
    data.mandalId = booth?.mandalId ?? null;
    data.assemblyId = assembly?.id ?? booth?.assemblyId ?? null;
    data.districtId = district?.id ?? assembly?.districtId ?? booth?.districtId ?? null;
    data.regionId = district?.regionId ?? null;
    data.stateId = assembly?.stateId ?? district?.stateId ?? null;
    if (booth && booth.id !== auth.member.boothId) {
      if (auth.member.boothId) {
        await prisma.booth.update({
          where: { id: auth.member.boothId },
          data: { memberCount: { decrement: 1 } },
        });
      }
      await prisma.booth.update({
        where: { id: booth.id },
        data: { memberCount: { increment: 1 } },
      });
    }
  }

  const member = await prisma.member.update({
    where: { id: auth.member.id },
    data,
    include: memberGraph,
  });
  if (data.stateId) {
    await persistMembershipNumber(member.id, member.rowId, data.stateId);
  }
  const fresh = data.stateId
    ? await prisma.member.findUniqueOrThrow({ where: { id: member.id }, include: memberGraph })
    : member;
  return ok(res, { member: serializeMember(fresh) });
});

membersRouter.post('/photo', photoUpload.single('photo'), async (req, res) => {
  const auth = req as AuthedRequest;
  const file = req.file;
  if (!file) throw badRequest('Choose a photo');
  const key = `members/${auth.member.id}/${randomUUID()}.jpg`;
  await putMemberPhoto(key, file.buffer, file.mimetype || 'image/jpeg');
  const member = await prisma.member.update({
    where: { id: auth.member.id },
    data: { photoUrl: key },
    include: { booth: true, posts: true, card: true },
  });
  return created(res, {
    photoKey: key,
    photoUrl: mediaPublicUrl(key),
    member: serializeMember(member),
  });
});

membersRouter.get('/check/:mobile', async (req, res) => {
  const mobile = String(req.params.mobile);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw badRequest('Enter a 10-digit Indian mobile number');
  const existing = await prisma.member.findUnique({
    where: { mobileE164: `+91${mobile}` },
    include: {
      booth: true,
      recruitedBy: { select: { id: true, fullName: true, membershipNumber: true, rowId: true } },
    },
  });
  if (!existing || existing.status === 'DRAFT') {
    return ok(res, { exists: false });
  }
  return ok(res, {
    exists: true,
    member: {
      membershipNumber: existing.membershipNumber,
      fullName: existing.fullName,
      boothCode: existing.booth?.code ?? null,
      addedAt: existing.createdAt,
      recruitedBy: existing.recruitedBy,
    },
  });
});

membersRouter.post('/register', validate(registerSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof registerSchema>;
  const booth = body.boothId
    ? await prisma.booth.findFirst({ where: { id: body.boothId, deletedAt: null } })
    : body.assemblyId
      ? await prisma.booth.findFirst({ where: { assemblyId: body.assemblyId, deletedAt: null }, orderBy: { boothNumber: 'asc' } })
      : null;
  const assembly = body.assemblyId
    ? await prisma.assemblyConstituency.findFirst({ where: { id: body.assemblyId } })
    : booth?.assemblyId
      ? await prisma.assemblyConstituency.findFirst({ where: { id: booth.assemblyId } })
      : null;
  if (!booth && !assembly) throw notFound('Assembly not found');
  const districtId = assembly?.districtId ?? booth?.districtId ?? null;
  const district = districtId ? await prisma.district.findFirst({ where: { id: districtId } }) : null;

  const required = await prisma.consentDocument.findFirst({
    where: { kind: 'MEMBERSHIP_REQUIRED', isCurrent: true, locale: body.locale },
  });
  if (!required) throw badRequest('Consent document is out of date');

  const stateId = assembly?.stateId ?? district?.stateId ?? null;
  const membershipNumber = membershipNumberFromRowId(auth.member.rowId, await stateCodeForId(stateId));
  const member = await prisma.member.update({
    where: { id: auth.member.id },
    data: {
      fullName: body.fullName,
      dateOfBirth: parseIsoDate(body.dateOfBirth),
      gender: body.gender,
      locale: body.locale,
      boothId: booth?.id ?? null,
      mandalId: booth?.mandalId ?? null,
      assemblyId: assembly?.id ?? booth?.assemblyId ?? null,
      districtId: district?.id ?? assembly?.districtId ?? booth?.districtId ?? null,
      regionId: district?.regionId ?? null,
      stateId,
      status: 'VERIFIED',
      whatsappOptIn: body.whatsappOptIn,
      membershipNumber,
      validTo: new Date('2028-03-31'),
      photoUrl: body.photoUrl ?? auth.member.photoUrl,
      address: body.address ?? null,
      pincode: body.pincode ?? null,
    },
    include: { booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } }, state: true, district: true, assembly: true, posts: true, card: true },
  });

  if (!member.posts.length) {
    await prisma.memberPost.create({
      data: { memberId: member.id, post: 'MEMBER', boothId: booth?.id ?? null, isPrimary: true },
    });
  }

  if (!member.card) {
    await prisma.membershipCard.create({
      data: {
        memberId: member.id,
        publicCode: membershipNumber,
        validTo: new Date('2028-03-31'),
      },
    });
  } else if (member.card.publicCode !== membershipNumber) {
    await prisma.membershipCard.update({
      where: { id: member.card.id },
      data: { publicCode: membershipNumber },
    });
  }

  await prisma.memberConsent.create({
    data: {
      memberId: member.id,
      documentId: required.id,
      kind: 'MEMBERSHIP_REQUIRED',
      locale: body.locale,
      accepted: true,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  });

  if (body.whatsappOptIn) {
    const optional = await prisma.consentDocument.findFirst({
      where: { kind: 'WHATSAPP_UPDATES', isCurrent: true, locale: body.locale },
    });
    if (optional) {
      await prisma.memberConsent.create({
        data: {
          memberId: member.id,
          documentId: optional.id,
          kind: 'WHATSAPP_UPDATES',
          locale: body.locale,
          accepted: true,
          ipAddress: req.ip ?? null,
        },
      });
    }
  }

  if (booth) {
    await prisma.booth.update({
      where: { id: booth.id },
      data: { memberCount: { increment: 1 } },
    });
  }

  const fresh = await prisma.member.findUniqueOrThrow({
    where: { id: member.id },
    include: { booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } }, state: true, district: true, assembly: true, posts: true, card: true },
  });
  return created(res, { member: serializeMember(fresh) });
});

membersRouter.post('/recruit', validate(recruitSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof recruitSchema>;
  const mobileE164 = `+91${body.mobile}`;
  if (mobileE164 === auth.member.mobileE164) {
    throw badRequest('You cannot add your own number');
  }

  const existing = await prisma.member.findUnique({ where: { mobileE164 } });
  if (existing && existing.status !== 'DRAFT') {
    throw conflict('Already a member', {
      membershipNumber: existing.membershipNumber,
      fullName: existing.fullName,
    });
  }

  const boothId = body.boothId ?? auth.member.boothId;
  if (!boothId) throw badRequest('Your booth is missing. Finish your own membership first.');
  const booth = await prisma.booth.findFirst({ where: { id: boothId, deletedAt: null } });
  if (!booth) throw notFound('Booth not found');

  const required = await prisma.consentDocument.findFirst({
    where: { kind: 'MEMBERSHIP_REQUIRED', isCurrent: true, locale: body.locale },
  });
  if (!required) throw badRequest('Consent document is out of date');

  const boothDistrict = booth.districtId
    ? await prisma.district.findFirst({ where: { id: booth.districtId }, include: { state: true } })
    : null;
  const recruitStateId = boothDistrict?.stateId ?? boothDistrict?.state?.id ?? null;
  const shared = {
    fullName: body.fullName,
    dateOfBirth: parseIsoDate(body.dateOfBirth),
    gender: body.gender,
    locale: body.locale,
    boothId: booth.id,
    mandalId: booth.mandalId,
    assemblyId: booth.assemblyId,
    districtId: booth.districtId,
    stateId: recruitStateId,
    status: 'VERIFIED' as const,
    whatsappOptIn: body.whatsappOptIn,
    recruitedById: auth.member.id,
    validTo: new Date('2028-03-31'),
    address: body.address ?? null,
    pincode: body.pincode ?? null,
  };

  let member = existing
    ? await prisma.member.update({
        where: { id: existing.id },
        data: {
          ...shared,
        },
        include: recruitGraph,
      })
    : await prisma.member.create({
        data: {
          mobileE164,
          mobileHash: hashMobile(mobileE164),
          ...shared,
        },
        include: recruitGraph,
      });
  const recruitNumber = membershipNumberFromRowId(member.rowId, boothDistrict?.state?.code);
  if (member.membershipNumber !== recruitNumber) {
    member = await prisma.member.update({
      where: { id: member.id },
      data: { membershipNumber: recruitNumber },
      include: recruitGraph,
    });
    await prisma.membershipCard.updateMany({
      where: { memberId: member.id },
      data: { publicCode: recruitNumber },
    });
  }

  const hasPost = await prisma.memberPost.findFirst({
    where: { memberId: member.id, endedAt: null },
  });
  if (!hasPost) {
    await prisma.memberPost.create({
      data: { memberId: member.id, post: 'MEMBER', boothId: booth.id, isPrimary: true },
    });
  }

  const hasConsent = await prisma.memberConsent.findFirst({
    where: { memberId: member.id, kind: 'MEMBERSHIP_REQUIRED' },
  });
  if (!hasConsent) {
    await prisma.memberConsent.create({
      data: {
        memberId: member.id,
        documentId: required.id,
        kind: 'MEMBERSHIP_REQUIRED',
        locale: body.locale,
        accepted: true,
        ipAddress: req.ip ?? null,
      },
    });
  }

  if (existing?.boothId !== booth.id) {
    await prisma.booth.update({
      where: { id: booth.id },
      data: { memberCount: { increment: 1 } },
    });
  }

  return created(res, {
    member: serializeMember(member),
    ...(await recruitsPayload(auth.member.id)),
  });
});

const contributionSchema = z
  .object({
    type: z.enum(['PRIMARY_MEMBER', 'VOLUNTEER', 'DONATION']),
    referralCode: z.string().trim().max(32).nullish(),
    volunteerMode: z.enum(['ONLINE', 'OFFLINE']).nullish(),
    weeklyHours: z.number().int().min(3).max(40).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'VOLUNTEER') {
      if (!value.volunteerMode) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select online or offline', path: ['volunteerMode'] });
      }
      if (value.weeklyHours == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter weekly hours between 3 and 40', path: ['weeklyHours'] });
      }
    }
  });

membersRouter.post('/contribution', validate(contributionSchema), async (req, res) => {
  const auth = req as AuthedRequest;
  const body = req.body as z.infer<typeof contributionSchema>;
  const referral = body.type === 'PRIMARY_MEMBER' ? body.referralCode?.trim() || null : null;
  const member = await prisma.member.update({
    where: { id: auth.member.id },
    data: {
      contributionType: body.type,
      referralCode: referral,
      volunteerMode: body.type === 'VOLUNTEER' ? body.volunteerMode ?? null : null,
      weeklyHours: body.type === 'VOLUNTEER' ? body.weeklyHours ?? null : null,
    },
    include: { booth: { include: { mandal: true, assembly: true, district: { include: { state: true } } } }, state: true, district: true, assembly: true, posts: true, card: true },
  });
  return ok(res, { member: serializeMember(member) });
});

membersRouter.get('/recruits', async (req, res) => {
  const auth = req as AuthedRequest;
  return ok(res, await recruitsPayload(auth.member.id));
});
