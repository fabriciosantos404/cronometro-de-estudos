import { describe, expect, it } from 'vitest';
import { defaultState } from '../../src/domain/models';
import { backupFilename, createBackup, importBackup, toJson } from '../../src/infra/backup';

function sampleState() {
  const now = Date.now();
  const s = defaultState();
  s.subjects = [{ id: 's1', name: 'Math', color: '#7c5cff', createdAt: now }];
  s.sessions = [{ id: 'x', subjectId: 's1', durationSec: 600, at: now, note: 'good', source: 'timer' }];
  return s;
}

describe('createBackup / toJson', () => {
  it('produces a portable, parseable payload', () => {
    const backup = createBackup(sampleState());
    expect(backup.app).toBe('cronometro-de-estudos');
    const parsed = JSON.parse(toJson(backup));
    expect(parsed.data.subjects).toHaveLength(1);
    expect(parsed.data.sessions[0].note).toBe('good');
  });
  it('builds a dated filename', () => {
    expect(backupFilename(new Date('2026-10-26T10:00:00Z'))).toBe('cronometro-estudos-backup-2026-10-26.json');
  });
});

describe('importBackup', () => {
  it('rejects invalid JSON', () => {
    const res = importBackup('this is not json {');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/JSON/);
  });

  it('rejects a JSON object with no recognizable data', () => {
    const res = importBackup(JSON.stringify({ foo: 'bar' }));
    expect(res.ok).toBe(false);
  });

  it('accepts our wrapped backup format', () => {
    const json = toJson(createBackup(sampleState()));
    const res = importBackup(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.subjects[0].name).toBe('Math');
      expect(res.state.sessions[0].durationSec).toBe(600);
    }
  });

  it('accepts a raw AppState payload', () => {
    const res = importBackup(JSON.stringify(sampleState()));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.sessions).toHaveLength(1);
  });

  it('never throws and sanitizes hostile content on import', () => {
    const hostile = {
      app: 'cronometro-de-estudos',
      data: {
        subjects: [{ id: 's', name: '<img src=x onerror=alert(1)>', color: 'not-a-color', createdAt: Date.now() }],
        sessions: [{ id: 'x', subjectId: null, durationSec: 60, at: Date.now(), note: 'ok', source: 'timer' }],
      },
    };
    const res = importBackup(JSON.stringify(hostile));
    expect(res.ok).toBe(true);
    if (res.ok) {
      // name is stored as text (rendered via textContent), color sanitized
      expect(res.state.subjects[0].color).toBe('#7c5cff');
      expect(res.state.subjects[0].name).toBe('<img src=x onerror=alert(1)>');
    }
  });

  it('returns an error for null/non-object payloads', () => {
    expect(importBackup('null').ok).toBe(false);
    expect(importBackup('"hello"').ok).toBe(false);
    expect(importBackup('[]').ok).toBe(false);
  });
});
