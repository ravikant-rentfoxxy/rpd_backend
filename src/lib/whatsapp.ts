import { env, isProd } from '../config/env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const INTERAKT_URL = 'https://api.interakt.ai/v1/public/message/';
const TEMPLATE_LANGUAGE = 'en';
const SEND_TIMEOUT_MS = 10_000;

type InteraktResponse = {
  result?: boolean;
  message?: string;
  id?: string;
};

export function whatsappConfigured() {
  return Boolean(env.INTERAKT_API_KEY);
}

/** Interakt wants the country code and the local number as separate fields. */
function splitE164(mobileE164: string) {
  const digits = mobileE164.replace(/\D/g, '');
  if (digits.length < 10) throw new AppError(400, 'bad_request', 'Invalid mobile number');
  return { countryCode: `+${digits.slice(0, digits.length - 10)}`, phoneNumber: digits.slice(-10) };
}

/**
 * Sends a one-time code over WhatsApp through Interakt.
 *
 * The template carries its own wording and takes the code twice: once as its
 * single body variable, and once for the copy-code button, which Meta requires
 * on Authentication-category templates. Interakt rejects the send if either is
 * missing.
 */
export async function sendOtpWhatsApp(mobileE164: string, code: string) {
  if (!env.INTERAKT_API_KEY) {
    if (isProd) throw new AppError(500, 'whatsapp_unconfigured', 'WhatsApp is not configured');
    logger.warn(`[whatsapp] INTERAKT_API_KEY not set — skipping send to ${mobileE164}`);
    return;
  }

  const { countryCode, phoneNumber } = splitE164(mobileE164);
  let res: Response;
  try {
    res = await fetch(INTERAKT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${env.INTERAKT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode,
        phoneNumber,
        type: 'Template',
        template: {
          name: env.INTERAKT_OTP_TEMPLATE,
          languageCode: TEMPLATE_LANGUAGE,
          bodyValues: [code],
          buttonValues: { '0': [code] },
        },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error('[whatsapp] Interakt request failed', { error: String(error) });
    throw new AppError(502, 'whatsapp_error', 'Could not send the WhatsApp code. Try again.');
  }

  const text = await res.text().catch(() => '');
  let body: InteraktResponse = {};
  try {
    body = text ? (JSON.parse(text) as InteraktResponse) : {};
  } catch {
    body = { message: text };
  }

  // Interakt answers 200 with result:false for template and number problems.
  if (!res.ok || body.result !== true) {
    logger.error('[whatsapp] Interakt rejected the message', {
      status: res.status,
      message: body.message ?? text,
      template: env.INTERAKT_OTP_TEMPLATE,
    });
    if (res.status === 429) throw new AppError(429, 'rate_limited', 'Too many messages right now. Try again shortly.');
    throw new AppError(502, 'whatsapp_error', 'Could not send the WhatsApp code. Try again.');
  }

  logger.info('[whatsapp] OTP sent', { to: mobileE164, id: body.id });
}
