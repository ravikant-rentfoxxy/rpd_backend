import { badRequest } from './errors.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string, label = 'Date of birth'): Date {
  const match = ISO_DATE.exec(value.trim());
  if (!match) {
    throw badRequest(`${label} must be YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest(`${label} must be a real calendar date as YYYY-MM-DD`);
  }
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (date > utcToday) {
    throw badRequest(`${label} cannot be in the future`);
  }
  if (year < today.getUTCFullYear() - 120) {
    throw badRequest(`${label} is not valid`);
  }
  return date;
}
