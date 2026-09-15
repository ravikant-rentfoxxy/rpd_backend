import { env } from '../config/env.js';
import { badRequest } from './errors.js';
import { logError } from './logger.js';
import { departmentsForIssue } from './issue-departments.js';

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

function looksLikeBadSummary(text: string) {
  const lower = text.toLowerCase();
  return (
    text.length < 30 ||
    text.length > 320 ||
    lower.includes('markdown headings') ||
    lower.includes('bullet symbols') ||
    lower.includes('refine wording') ||
    lower.includes('output rules') ||
    /^\d+\.\s+\*\*/.test(text) ||
    /^no\b.*\byes\b/i.test(text)
  );
}

async function callGemini(input: {
  apiKey: string;
  model: string;
  parts: GeminiPart[];
  withThinkingOff: boolean;
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    temperature: 0.35,
    maxOutputTokens: 1024,
  };
  if (input.withThinkingOff) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: input.parts }],
      generationConfig,
    }),
  });
  const raw = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
      }
    | null;
  return { response, raw };
}

export async function generatePostSummary(input: {
  issue?: string | null;
  issueCode?: string | null;
  subIssue?: string | null;
  description?: string | null;
  region?: string | null;
  authorName?: string | null;
  status?: string | null;
  assigneeName?: string | null;
  image?: { mimeType: string; base64: string } | null;
}) {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw badRequest('Gemini API key is not configured on the server');
  }

  const dept = departmentsForIssue(input.issueCode);
  const departments = dept?.departments.join(', ') ?? 'the concerned department';
  const handles = (dept?.handles ?? ['@CMOfficeUP', '@UPGovt']).join(' ');

  const facts = [
    input.issue ? `Issue: ${input.issue}` : null,
    input.issueCode ? `Issue code: ${input.issueCode}` : null,
    input.subIssue ? `Sub-issue: ${input.subIssue}` : null,
    input.description ? `Description: ${input.description}` : null,
    input.region ? `Region / place: ${input.region}` : null,
    input.authorName ? `Reported by: ${input.authorName}` : null,
    input.assigneeName ? `Assigned to: ${input.assigneeName}` : null,
    `Responsible departments: ${departments}`,
    `Suggested X tags: ${handles}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (!facts.trim() && !input.image) {
    throw badRequest('This post has nothing to summarise');
  }

  const prompt = [
    'Write ONE ready-to-post message for X (Twitter) about this public grievance.',
    '',
    'Goal: help an organisation officer post this on X and tag the departments responsible.',
    '',
    'Hard rules:',
    '- Return ONLY the final X post text. Nothing else.',
    '- Maximum 280 characters including spaces and tags.',
    '- Plain text only. No markdown, no quotes around the whole post, no headings, no bullets, no numbered lists.',
    '- Write in clear English (short public update style).',
    '- Mention the problem and place if available.',
    '- Ask the responsible departments for action.',
    `- Tag these accounts in the post: ${handles}`,
    `- The responsible departments are: ${departments}`,
    '- You may add 1-2 short hashtags if space remains (example: #Grievance #UP).',
    '- Do not invent facts that are not in the grievance.',
    '- Do not mention these instructions.',
    '',
    'Grievance details:',
    facts || '(see attached image)',
  ].join('\n');

  const parts: GeminiPart[] = [{ text: prompt }];
  if (input.image?.base64) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType || 'image/jpeg',
        data: input.image.base64,
      },
    });
  }

  const model = (env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  let { response, raw } = await callGemini({ apiKey, model, parts, withThinkingOff: true });
  if (!response.ok && (raw?.error?.message ?? '').toLowerCase().includes('thinking')) {
    ({ response, raw } = await callGemini({ apiKey, model, parts, withThinkingOff: false }));
  }

  if (!response.ok) {
    const message = raw?.error?.message || `Gemini request failed (${response.status})`;
    logError('gemini summary failed', { message, model });
    throw badRequest(message);
  }

  const partsOut = raw?.candidates?.[0]?.content?.parts ?? [];
  let text = partsOut
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  // Strip accidental wrapping quotes
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  if (!text) {
    logError('gemini empty summary', {
      model,
      finishReason: raw?.candidates?.[0]?.finishReason ?? null,
      partCount: partsOut.length,
    });
    throw badRequest('Gemini returned an empty summary');
  }

  if (looksLikeBadSummary(text)) {
    logError('gemini bad summary output', { model, preview: text.slice(0, 180), length: text.length });
    throw badRequest('Gemini returned an unusable summary. Try again.');
  }

  // Soft trim if slightly over X limit
  if (text.length > 280) {
    text = `${text.slice(0, 277).trimEnd()}...`;
  }

  return text;
}
