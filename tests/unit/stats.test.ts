import { describe, expect, it } from 'vitest';
import { Session, Subject } from '../../src/domain/models';
import {
  latestSession,
  sessionCount,
  secBySubject,
  streakDays,
  todaySec,
  totalSec,
  weekSec,
} from '../../src/domain/stats';
import { startOfDay, startOfWeek } from '../../src/domain/time';

function session(overrides: Partial<Session>): Session {
  return {
    id: Math.random().toString(36).slice(2),
    subjectId: null,
    durationSec: 60,
    at: Date.now(),
    note: '',
    source: 'timer',
    ...overrides,
  };
}

describe('totalSec / sessionCount', () => {
  it('sums durations and counts sessions', () => {
    const sessions = [session({ durationSec: 100 }), session({ durationSec: 200 })];
    expect(totalSec(sessions)).toBe(300);
    expect(sessionCount(sessions)).toBe(2);
  });
  it('returns 0 for empty', () => {
    expect(totalSec([])).toBe(0);
    expect(sessionCount([])).toBe(0);
  });
});

describe('todaySec', () => {
  it('only counts today', () => {
    const now = Date.now();
    const sessions = [
      session({ durationSec: 600, at: now }),
      session({ durationSec: 999, at: startOfDay(now) - 1000 }), // yesterday
    ];
    expect(todaySec(sessions, now)).toBe(600);
  });
});

describe('weekSec', () => {
  it('only counts the current week', () => {
    const now = Date.now();
    const thisWeek = startOfWeek(now).getTime() + 3600_000;
    const lastMonth = now - 40 * 86_400_000;
    const sessions = [session({ durationSec: 300, at: thisWeek }), session({ durationSec: 5000, at: lastMonth })];
    expect(weekSec(sessions, now)).toBe(300);
  });
});

describe('secBySubject', () => {
  const subjects: Subject[] = [
    { id: 'a', name: 'Math', color: '#111111', createdAt: 1 },
    { id: 'b', name: 'Bio', color: '#222222', createdAt: 1 },
  ];

  it('aggregates per subject and excludes the null "Geral" bucket', () => {
    const sessions = [
      session({ subjectId: 'a', durationSec: 100 }),
      session({ subjectId: 'a', durationSec: 50 }),
      session({ subjectId: 'b', durationSec: 200 }),
      session({ subjectId: null, durationSec: 999 }),
    ];
    const map = secBySubject(sessions, subjects);
    expect(map.get('a')).toBe(150);
    expect(map.get('b')).toBe(200);
    expect(map.has('null' as string)).toBe(false);
  });

  it('initializes subjects with no sessions to 0', () => {
    const map = secBySubject([], subjects);
    expect(map.get('a')).toBe(0);
    expect(map.get('b')).toBe(0);
  });

  it('applies a filter', () => {
    const now = Date.now();
    const sessions = [
      session({ subjectId: 'a', durationSec: 10, at: now }),
      session({ subjectId: 'a', durationSec: 90, at: now - 40 * 86_400_000 }),
    ];
    const start = startOfWeek(now).getTime();
    const map = secBySubject(sessions, subjects, (s) => s.at >= start);
    expect(map.get('a')).toBe(10);
  });
});

describe('streakDays', () => {
  const day = (offset: number) => startOfDay(Date.now()) - offset * 86_400_000 + 12 * 3600_000;

  it('is 0 with no sessions', () => {
    expect(streakDays([], Date.now())).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const sessions = [session({ at: day(0) }), session({ at: day(1) }), session({ at: day(2) })];
    expect(streakDays(sessions, Date.now())).toBe(3);
  });

  it('stops at a gap', () => {
    // today, yesterday, then a gap (day 3), then day 4
    const sessions = [session({ at: day(0) }), session({ at: day(1) }), session({ at: day(4) })];
    expect(streakDays(sessions, Date.now())).toBe(2);
  });

  it('still works before studying today (counts from yesterday)', () => {
    const sessions = [session({ at: day(1) }), session({ at: day(2) })];
    expect(streakDays(sessions, Date.now())).toBe(2);
  });
});

describe('latestSession', () => {
  it('returns the newest by timestamp', () => {
    const sessions = [
      session({ at: 1000, id: 'old' }),
      session({ at: 5000, id: 'new' }),
      session({ at: 3000, id: 'mid' }),
    ];
    expect(latestSession(sessions)?.id).toBe('new');
  });
  it('returns null when empty', () => {
    expect(latestSession([])).toBeNull();
  });
});
