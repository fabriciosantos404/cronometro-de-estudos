/**
 * Timer domain logic — pure state transitions driven by wall-clock timestamps.
 * The UI never "counts ticks"; it derives elapsed time from `startedAt`,
 * which keeps the clock accurate across tab throttling and page reloads.
 */
import type { TimerState } from './models';

/** Seconds elapsed for the given timer at `nowMs`. Never negative. */
export function elapsedSec(timer: TimerState, nowMs: number): number {
  if (!timer.running) return Math.max(0, Math.floor(timer.baseSec));
  const delta = Math.max(0, (nowMs - timer.startedAt) / 1000);
  return Math.max(0, Math.floor(timer.baseSec + delta));
}

/** Begin counting. Idempotent — an already-running timer is unchanged. */
export function start(timer: TimerState, nowMs: number): TimerState {
  if (timer.running) return timer;
  return { ...timer, running: true, startedAt: nowMs, updatedAt: nowMs };
}

/** Freeze the running segment into `baseSec`. Idempotent when paused. */
export function pause(timer: TimerState, nowMs: number): TimerState {
  if (!timer.running) return timer;
  const accrued = Math.max(0, Math.floor((nowMs - timer.startedAt) / 1000));
  return {
    ...timer,
    running: false,
    startedAt: 0,
    baseSec: Math.max(0, timer.baseSec + accrued),
    updatedAt: nowMs,
  };
}

/** Stop and clear accumulated time, preserving the selected subject. */
export function reset(timer: TimerState, nowMs: number): TimerState {
  return { ...timer, running: false, startedAt: 0, baseSec: 0, updatedAt: nowMs };
}

/** Assign (or clear with null) the subject the timer is studying. */
export function setSubject(timer: TimerState, subjectId: string | null): TimerState {
  return { ...timer, subjectId };
}

/**
 * Return a paused snapshot if currently running. Used on load and on
 * `visibilitychange`/`pagehide` to satisfy "pause when leaving the site".
 */
export function freezeIfRunning(timer: TimerState, nowMs: number): TimerState {
  return timer.running ? pause(timer, nowMs) : timer;
}
