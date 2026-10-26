import { describe, expect, it } from 'vitest';
import { defaultTimer } from '../../src/domain/models';
import {
  elapsedSec,
  freezeIfRunning,
  pause,
  reset,
  setSubject,
  start,
} from '../../src/domain/timer';

describe('timer domain', () => {
  it('starts at zero when paused', () => {
    const t = defaultTimer();
    expect(elapsedSec(t, 1_000_000)).toBe(0);
  });

  it('derives elapsed time from timestamps while running', () => {
    const t = start(defaultTimer(), 1000);
    expect(elapsedSec(t, 1000)).toBe(0);
    expect(elapsedSec(t, 5000)).toBe(4);
    expect(elapsedSec(t, 6500)).toBe(5); // floors 5.5
  });

  it('accumulates base across pause/resume', () => {
    let t = start(defaultTimer(), 1000);
    t = pause(t, 5000); // 4s accrued
    expect(elapsedSec(t, 9999)).toBe(4); // paused stays put
    t = start(t, 10_000);
    t = pause(t, 12_000); // +2s
    expect(elapsedSec(t, 20_000)).toBe(6);
  });

  it('start is idempotent when already running', () => {
    const running = start(defaultTimer(), 1000);
    const again = start(running, 9999);
    expect(again.startedAt).toBe(1000);
  });

  it('pause is idempotent when already paused', () => {
    const paused = pause(start(defaultTimer(), 1000), 5000);
    const again = pause(paused, 9999);
    expect(again.baseSec).toBe(paused.baseSec);
  });

  it('reset clears accumulated time but keeps subject', () => {
    const t = setSubject(start(defaultTimer(), 1000), 's1');
    const cleared = reset(t, 6000);
    expect(cleared.baseSec).toBe(0);
    expect(cleared.running).toBe(false);
    expect(cleared.subjectId).toBe('s1');
  });

  it('never reports negative elapsed time', () => {
    const t = { ...defaultTimer(), running: true, startedAt: 10_000 };
    expect(elapsedSec(t, 5000)).toBe(0);
  });

  it('freezeIfRunning pauses on leave, leaves paused untouched', () => {
    const running = start(defaultTimer(), 1000);
    const frozen = freezeIfRunning(running, 7000);
    expect(frozen.running).toBe(false);
    expect(frozen.baseSec).toBe(6);
    const stillPaused = freezeIfRunning(defaultTimer(), 7000);
    expect(stillPaused.baseSec).toBe(0);
  });
});
