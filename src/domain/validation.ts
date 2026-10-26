/**
 * Validation & sanitization — the boundary that keeps untrusted input out.
 * Every value coming from the user or storage passes through here.
 */
import { PALETTE } from './models';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const LIMITS = {
  subjectName: 40,
  note: 120,
  minGoalHours: 0.5,
  maxGoalHours: 24,
  maxManualHours: 24,
  maxManualMinutes: 59,
  maxSessions: 5000,
} as const;

/** Trim + collapse whitespace, enforce max length, strip control chars. */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // Remove control characters (keep normal spaces/tabs collapsed later).
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Validate a subject name: non-empty after sanitize, within length. */
export function sanitizeSubjectName(value: unknown): string {
  return sanitizeText(value, LIMITS.subjectName);
}

/** Validate a session note/comment. */
export function sanitizeNote(value: unknown): string {
  return sanitizeText(value, LIMITS.note);
}

/** True when `value` is a valid 3- or 6-digit hex color. */
export function isValidHexColor(value: unknown): boolean {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** Normalize to a safe hex color, falling back to the palette default. */
export function sanitizeColor(value: unknown, fallback: string = PALETTE[0]): string {
  if (!isValidHexColor(value)) return fallback;
  return (value as string).toLowerCase();
}

/** Clamp a number into [min, max]; NaN/invalid falls back. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Goal in hours, clamped to sane bounds. */
export function sanitizeGoalHours(value: unknown): number {
  return clampNumber(value, LIMITS.minGoalHours, LIMITS.maxGoalHours, 4);
}

/** True when a duration is a finite, positive number of seconds. */
export function isValidDurationSec(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** True when `timestamp` is a plausible, finite epoch-ms value. */
export function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8.64e13;
}

/** Case-insensitive duplicate check against existing subject names. */
export function isDuplicateSubject(name: string, existing: string[]): boolean {
  const target = name.trim().toLowerCase();
  return existing.some((n) => n.trim().toLowerCase() === target);
}
