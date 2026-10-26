import { describe, expect, it } from 'vitest';
import {
  dayKey,
  formatClock,
  formatDuration,
  formatRelativeDate,
  formatTime,
  isSameDay,
  pad,
  startOfWeek,
} from '../../src/domain/time';

describe('pad', () => {
  it('pads to two digits', () => {
    expect(pad(0)).toBe('00');
    expect(pad(7)).toBe('07');
    expect(pad(12)).toBe('12');
  });
});

describe('formatClock', () => {
  it('formats zero', () => {
    expect(formatClock(0)).toBe('00:00:00');
  });
  it('formats h/m/s with padding', () => {
    expect(formatClock(3661)).toBe('01:01:01');
    expect(formatClock(65)).toBe('00:01:05');
  });
  it('never goes negative', () => {
    expect(formatClock(-10)).toBe('00:00:00');
  });
});

describe('formatDuration', () => {
  it('handles edge values', () => {
    expect(formatDuration(0)).toBe('0min');
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(60)).toBe('1min');
    expect(formatDuration(90)).toBe('1min 30s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3660)).toBe('1h 1min');
    expect(formatDuration(5400)).toBe('1h 30min');
  });
});

describe('dayKey / isSameDay', () => {
  it('builds a local day key', () => {
    const d = new Date(2026, 0, 5, 13, 45); // Jan 5 2026 local
    expect(dayKey(d)).toBe('2026-01-05');
  });
  it('compares same local day', () => {
    const a = new Date(2026, 5, 1, 8, 0);
    const b = new Date(2026, 5, 1, 22, 30);
    const c = new Date(2026, 5, 2, 8, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});

describe('startOfWeek', () => {
  it('returns Monday 00:00', () => {
    // 2026-01-07 is a Wednesday.
    const wed = new Date(2026, 0, 7, 15, 30);
    const start = startOfWeek(wed);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(5); // Monday Jan 5
  });
  it('keeps Monday at start of week', () => {
    const mon = new Date(2026, 0, 5, 9, 0);
    expect(startOfWeek(mon).getDate()).toBe(5);
  });
});

describe('formatRelativeDate', () => {
  const now = new Date(2026, 2, 10, 12, 0); // Mar 10 2026
  it('says hoje for today', () => {
    expect(formatRelativeDate(new Date(2026, 2, 10, 9, 0), now)).toBe('hoje');
  });
  it('says ontem for yesterday', () => {
    expect(formatRelativeDate(new Date(2026, 2, 9, 23, 0), now)).toBe('ontem');
  });
  it('formats older dates', () => {
    expect(formatRelativeDate(new Date(2026, 0, 3, 10, 0), now)).toBe('03/01/2026');
  });
});

describe('formatTime', () => {
  it('formats HH:MM', () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
  });
});
