/**
 * Time helpers — pure functions over timestamps. No DOM, no Date mutation leaks.
 */

/** Pad a number to at least 2 digits. */
export function pad(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

/** Format seconds as a fixed-width clock: "HH:MM:SS". */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Format seconds as human duration: "1h 30min", "25min", "30s", "0min". */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec === 0) return '0min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  if (m > 0) return s > 0 && m < 10 ? `${m}min ${s}s` : `${m}min`;
  return `${s}s`;
}

/** Local day key "YYYY-MM-DD" (avoids UTC off-by-one of toISOString). */
export function dayKey(input: Date | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True when both timestamps fall on the same local day. */
export function isSameDay(a: Date | number, b: Date | number): boolean {
  return dayKey(a) === dayKey(b);
}

/** Monday 00:00 local time of the week containing `input`. */
export function startOfWeek(input: Date | number): Date {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dow);
  return d;
}

/** Timestamp (ms) for local midnight of the day containing `input`. */
export function startOfDay(input: Date | number): number {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Human-friendly date for history rows: "hoje", "ontem", or "dd/mm/yyyy". */
export function formatRelativeDate(input: Date | number, now: Date | number = Date.now()): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isSameDay(d, now)) return 'hoje';
  const yesterday = new Date(now instanceof Date ? now.getTime() : now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'ontem';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "HH:MM" start time for a session row. */
export function formatTime(input: Date | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
