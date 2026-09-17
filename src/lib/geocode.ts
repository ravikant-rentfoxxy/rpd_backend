import { AppError, badRequest } from './errors.js';
import { logError } from './logger.js';

const FILLER_RE = /\b(village|gram|gaon|block|tehsil|tahsil|district|post|ps|thana|panchayat)\b/gi;

function isFillerWord(word: string) {
  return /^(village|gram|gaon|block|tehsil|tahsil|district|post|ps|thana|panchayat)$/i.test(word);
}

type GeocodeVariant = { query: string; approximate: boolean };

const MAX_VARIANTS = 5;

function geocodeVariants(q: string): GeocodeVariant[] {
  const cleaned = q.replace(/\s+/g, ' ').trim();
  const variants: GeocodeVariant[] = [{ query: cleaned, approximate: false }];
  const stripped = cleaned.replace(FILLER_RE, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  if (stripped) variants.push({ query: stripped, approximate: false });

  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  const head = parts[0];
  if (head != null && parts.length >= 2) {
    const firstWord = head.split(/\s+/).find((word) => word && !isFillerWord(word)) ?? head.split(/\s+/)[0];
    if (firstWord) {
      variants.push({ query: `${firstWord}, ${parts.slice(1).join(', ')}`, approximate: true });
      variants.push({ query: `${firstWord}, ${parts[parts.length - 1]}`, approximate: true });
    }
    // Drop leading parts ("Govt School, Sohal, Agra" -> "Sohal, Agra"), never down to the city alone.
    for (let i = 1; i <= parts.length - 2; i++) {
      variants.push({ query: parts.slice(i).join(', '), approximate: true });
    }
  } else {
    // No commas: drop leading words so a misspelt building name still finds its area
    // ("jmd magapolis sector 48 gurugram" -> "sector 48 gurugram"). Keep at least two words.
    const words = stripped.split(' ').filter(Boolean);
    for (let i = 1; i <= words.length - 2; i++) {
      if (/^\d+$/.test(words[i] ?? '')) continue;
      variants.push({ query: words.slice(i).join(' '), approximate: true });
    }
  }

  const seen = new Set<string>();
  return variants
    .filter((v) => {
      const key = v.query.toLowerCase();
      if (v.query.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_VARIANTS);
}

const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_TIMEOUT_MS = 8000;
const NOMINATIM_RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

/** Nominatim allows one request per second for the whole app, so every call goes through this queue. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastNominatimAt = Date.now();
    }
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

type NominatimRow = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  addresstype?: string;
};

async function nominatimRows(q: string, limit: number): Promise<NominatimRow[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', `${limit}`);
  url.searchParams.set('countrycodes', 'in');

  for (let attempt = 1; attempt <= 2; attempt++) {
    let failure: string;
    let retryable = true;
    try {
      const response = await throttled(() =>
        fetch(url, {
          headers: {
            'User-Agent': 'RPD-App/1.0 (ravi@rentfoxxy.com)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
        }),
      );
      if (response.ok) {
        const payload: unknown = await response.json();
        return Array.isArray(payload) ? (payload as NominatimRow[]) : [];
      }
      failure = `HTTP ${response.status}`;
      retryable = response.status === 429 || response.status >= 500;
    } catch (error) {
      failure = String(error);
    }
    logError('nominatim search failed', { q, attempt, failure });
    if (!retryable) break;
    if (attempt === 1) await sleep(NOMINATIM_RETRY_DELAY_MS);
  }
  throw badRequest('Address lookup is busy right now. Try again in a moment.');
}

function toPlace(row: NominatimRow, fallbackName: string) {
  const latitude = row.lat == null ? Number.NaN : Number(row.lat);
  const longitude = row.lon == null ? Number.NaN : Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const displayName = row.display_name ?? fallbackName;
  return {
    name: row.name?.trim() || displayName.split(',')[0]?.trim() || fallbackName,
    displayName,
    kind: row.addresstype ?? row.type ?? null,
    latitude,
    longitude,
  };
}

/** Type-ahead place suggestions for an address box. Returns at most `limit` rows. */
export async function searchPlaces(q: string, limit: number) {
  const rows = await nominatimRows(q, limit);
  const seen = new Set<string>();
  const places = [];
  for (const row of rows) {
    const place = toPlace(row, q);
    if (!place || seen.has(place.displayName)) continue;
    seen.add(place.displayName);
    places.push(place);
    if (places.length >= limit) break;
  }
  return places;
}

async function nominatimSearch(q: string) {
  const rows = await nominatimRows(q, 1);
  const row = rows[0];
  if (!row) return null;
  return toPlace(row, q);
}

/**
 * Looks up an Indian address on OpenStreetMap, retrying with simplified variants.
 * `approximate` is true when only a shortened form of the address matched (e.g. just the sector).
 */
export async function geocodeAddress(q: string) {
  const variants = geocodeVariants(q);
  try {
    for (const variant of variants) {
      const hit = await nominatimSearch(variant.query);
      if (hit) return { matchedQuery: variant.query, approximate: variant.approximate, ...hit };
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest('Could not verify this address');
  }
  return null;
}
