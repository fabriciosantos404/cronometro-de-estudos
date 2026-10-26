/**
 * Statistics domain — pure aggregations over sessions.
 * All functions are deterministic and side-effect free for easy testing.
 */
import type { Session, Subject } from './models';
import { dayKey, startOfDay, startOfWeek } from './time';

/** Sum of all session durations (seconds). */
export function totalSec(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.durationSec, 0);
}

/** Seconds studied today (local day) relative to `nowMs`. */
export function todaySec(sessions: Session[], nowMs: number): number {
  const today = dayKey(nowMs);
  return sessions
    .filter((s) => dayKey(s.at) === today)
    .reduce((sum, s) => sum + s.durationSec, 0);
}

/** Seconds studied in the current week (Monday-based) relative to `nowMs`. */
export function weekSec(sessions: Session[], nowMs: number): number {
  const weekStart = startOfWeek(nowMs).getTime();
  return sessions
    .filter((s) => s.at >= weekStart)
    .reduce((sum, s) => sum + s.durationSec, 0);
}

/** Seconds per subject, optionally filtered by a predicate (e.g. week only). */
export function secBySubject(
  sessions: Session[],
  subjects: Subject[],
  filter: (s: Session) => boolean = () => true,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const subject of subjects) map.set(subject.id, 0);
  for (const session of sessions) {
    if (!filter(session)) continue;
    if (session.subjectId == null) continue; // "Geral" excluded from per-subject chart
    map.set(session.subjectId, (map.get(session.subjectId) ?? 0) + session.durationSec);
  }
  return map;
}

/** Per-subject seconds for the current week. */
export function weekBySubject(sessions: Session[], subjects: Subject[]): Map<string, number> {
  const weekStart = () => startOfWeek(Date.now()).getTime();
  const start = weekStart();
  return secBySubject(sessions, subjects, (s) => s.at >= start);
}

/** Per-subject seconds across all time. */
export function totalBySubject(sessions: Session[], subjects: Subject[]): Map<string, number> {
  return secBySubject(sessions, subjects);
}

/** Number of recorded sessions. */
export function sessionCount(sessions: Session[]): number {
  return sessions.length;
}

/**
 * Consecutive-day study streak ending today (or yesterday if today is empty).
 * A day counts when it has at least one session.
 */
export function streakDays(sessions: Session[], nowMs: number): number {
  if (sessions.length === 0) return 0;
  const activeDays = new Set(sessions.map((s) => dayKey(s.at)));
  const today = startOfDay(nowMs);
  // Allow the streak to survive while today is still in progress.
  let cursor = activeDays.has(dayKey(today)) ? today : today - 86_400_000;
  let streak = 0;
  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
}

/** The single most recent session (newest first), or null. */
export function latestSession(sessions: Session[]): Session | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((newest, s) => (s.at > newest.at ? s : newest), sessions[0]);
}
