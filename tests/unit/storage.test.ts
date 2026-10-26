import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, defaultState } from '../../src/domain/models';
import { normalizeState } from '../../src/infra/storage';

describe('normalizeState', () => {
  it('returns defaults for null/garbage', () => {
    expect(normalizeState(null)).toEqual(defaultState());
    expect(normalizeState('string')).toEqual(defaultState());
    expect(normalizeState(42)).toEqual(defaultState());
  });

  it('keeps valid subjects and sessions', () => {
    const now = Date.now();
    const state = normalizeState({
      version: SCHEMA_VERSION,
      subjects: [{ id: 's1', name: 'Math', color: '#7c5cff', createdAt: now }],
      sessions: [{ id: 'x', subjectId: 's1', durationSec: 300, at: now, note: 'ok', source: 'timer' }],
      timer: { running: false, subjectId: null, startedAt: 0, baseSec: 0, updatedAt: now },
      settings: { goalHours: 4, theme: 'dark', chartRange: 'week', historyFilter: 'all' },
    });
    expect(state.subjects).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
    expect(state.version).toBe(SCHEMA_VERSION);
  });

  it('drops invalid sessions (non-positive duration or bad timestamp)', () => {
    const state = normalizeState({
      subjects: [],
      sessions: [
        { id: 'bad', subjectId: null, durationSec: -5, at: Date.now(), note: '', source: 'timer' },
        { id: 'bad2', subjectId: null, durationSec: 60, at: 0, note: '', source: 'timer' },
      ],
    });
    expect(state.sessions).toHaveLength(0);
  });

  it('sanitizes an invalid subject color to the palette default', () => {
    const state = normalizeState({
      subjects: [{ id: 's1', name: 'Math', color: 'javascript:alert(1)', createdAt: Date.now() }],
      sessions: [],
    });
    expect(state.subjects[0].color).toBe('#7c5cff');
  });

  it('drops sessions that reference a deleted subject', () => {
    const state = normalizeState({
      subjects: [{ id: 'kept', name: 'A', color: '#111111', createdAt: Date.now() }],
      sessions: [
        { id: 'ok', subjectId: 'kept', durationSec: 60, at: Date.now(), note: '', source: 'timer' },
        { id: 'orphan', subjectId: 'ghost', durationSec: 60, at: Date.now(), note: '', source: 'timer' },
        { id: 'geral', subjectId: null, durationSec: 60, at: Date.now(), note: '', source: 'timer' },
      ],
    });
    expect(state.sessions).toHaveLength(2);
  });

  it('migrates legacy top-level settings (pre-settings shape)', () => {
    const state = normalizeState({
      goalHours: 8,
      theme: 'light',
      chartRange: 'total',
      subjects: [],
      sessions: [],
    });
    expect(state.settings.goalHours).toBe(8);
    expect(state.settings.theme).toBe('light');
    expect(state.settings.chartRange).toBe('total');
    expect(state.version).toBe(SCHEMA_VERSION);
  });

  it('forces timer to paused on load (never resumes running)', () => {
    const now = Date.now();
    const state = normalizeState({
      timer: { running: true, subjectId: 's', startedAt: now, baseSec: 30, updatedAt: now },
      subjects: [],
      sessions: [],
    });
    expect(state.timer.running).toBe(false);
    expect(state.timer.startedAt).toBe(0);
    expect(state.timer.baseSec).toBe(30);
  });

  it('sanitizes goal hours into bounds', () => {
    const state = normalizeState({ settings: { goalHours: 9999 }, subjects: [], sessions: [] });
    expect(state.settings.goalHours).toBe(24);
  });
});
