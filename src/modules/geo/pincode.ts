import { prisma } from '../../lib/prisma.js';
import { badRequest } from '../../lib/errors.js';

function foldStateName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\bnct of\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function lookupPincodeState(pincode: string) {
  const pin = pincode.trim();
  if (!/^\d{6}$/.test(pin)) throw badRequest('Enter a 6-digit pincode');

  let payload: unknown;
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('pincode lookup failed');
    payload = await response.json();
  } catch {
    throw badRequest('Could not verify this pincode. Try again.');
  }

  const row = Array.isArray(payload) ? (payload[0] as { Status?: string; PostOffice?: Array<{ State?: string; District?: string }> }) : null;
  const offices = row?.Status === 'Success' ? row.PostOffice ?? [] : [];
  const stateName = offices.map((office) => office.State?.trim() ?? '').find((name) => name.length > 0) ?? '';
  const districtName = offices.map((office) => office.District?.trim() ?? '').find((name) => name.length > 0) ?? '';
  if (!stateName) throw badRequest('Enter a valid pincode');

  const folded = foldStateName(stateName);
  const states = await prisma.state.findMany({ select: { id: true, name: true, nameHi: true } });
  const state = states.find((item) => {
    const names = [item.name, item.nameHi ?? ''].map(foldStateName).filter(Boolean);
    return names.some((name) => name === folded || folded.includes(name) || name.includes(folded));
  });

  return {
    pincode: pin,
    stateName,
    districtName: districtName || null,
    stateId: state?.id ?? null,
    matchedStateName: state?.name ?? null,
    state: state ? { id: state.id, name: state.name } : null,
  };
}

export async function assertPincodeMatchesState(pincode: string, stateId: string) {
  const hit = await lookupPincodeState(pincode);
  if (!hit.stateId) {
    throw badRequest(`This pincode belongs to ${hit.stateName}. Select that state.`);
  }
  if (hit.stateId !== stateId) {
    throw badRequest(`This pincode belongs to ${hit.stateName}. Select that state or enter a matching pincode.`);
  }
  return hit;
}
