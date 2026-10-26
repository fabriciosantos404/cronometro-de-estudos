/**
 * Storage adapter — a defensive localStorage layer.
 *
 * Responsibilities:
 *  - Versioned reads with schema migration hooks.
 *  - Never trust persisted shape: validate/coerce every field.
 *  - Fail soft: corrupt or unavailable storage yields a safe default state.
 */
import {
  AppState,
  SCHEMA_VERSION,
  Session,
  Subject,
  TimerState,
  defaultSettings,
  defaultState,
  defaultTimer,
} from '../domain/models';
import * as timerDomain from '../domain/timer';
import {
  isValidDurationSec,
  isValidTimestamp,
  sanitizeColor,
  sanitizeGoalHours,
  sanitizeNote,
  sanitizeSubjectName,
} from '../domain/validation';

export const STORAGE_KEY = 'cronometroEstudos';

/** Allow swapping localStorage for IndexedDB later without touching callers. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageAdapter | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Touch the API to detect Safari private-mode / disabled storage.
    const probe = '__probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/* --------------------------------- parsing -------------------------------- */

function parseSubject(raw: unknown): Subject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = sanitizeSubjectName(r.name);
  if (!name) return null;
  const id = typeof r.id === 'string' && r.id ? r.id : `subj-${name.length}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name,
    color: sanitizeColor(r.color),
    createdAt: isValidTimestamp(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

function parseSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isValidDurationSec(r.durationSec)) return null;
  if (!isValidTimestamp(r.at)) return null;
  const source = r.source === 'manual' ? 'manual' : 'timer';
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `sess-${(r.at as number).toString(36)}`,
    subjectId: typeof r.subjectId === 'string' && r.subjectId ? r.subjectId : null,
    durationSec: Math.round(r.durationSec as number),
    at: r.at as number,
    note: sanitizeNote(r.note),
    source,
  };
}

function parseTimer(raw: unknown): TimerState {
  const base = defaultTimer();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  return {
    running: false, // never resume as running; frozen on load
    subjectId: typeof r.subjectId === 'string' && r.subjectId ? r.subjectId : null,
    startedAt: 0,
    baseSec: isValidDurationSec(r.baseSec) ? Math.floor(r.baseSec as number) : 0,
    updatedAt: isValidTimestamp(r.updatedAt) ? (r.updatedAt as number) : Date.now(),
  };
}

/**
 * Migrate older payloads to the current schema.
 * v0 (unversioned) had the same core shape; we simply re-stamp the version.
 */
function migrate(payload: Record<string, unknown>): Record<string, unknown> {
  const version = typeof payload.version === 'number' ? payload.version : 0;
  if (version > SCHEMA_VERSION) {
    // Future/unknown schema: best-effort read of known fields, then downgrade.
    return payload;
  }
  return { ...payload, version: SCHEMA_VERSION };
}

/** Normalize any raw payload into a fully-valid AppState. */
export function normalizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return defaultState();
  const payload = migrate(raw as Record<string, unknown>);

  const subjects = Array.isArray(payload.subjects)
    ? (payload.subjects.map(parseSubject).filter((s): s is Subject => s !== null))
    : [];

  const sessions = Array.isArray(payload.sessions)
    ? (payload.sessions.map(parseSession).filter((s): s is Session => s !== null))
    : [];

  const settings = defaultSettings();
  if (payload.settings && typeof payload.settings === 'object') {
    const s = payload.settings as Record<string, unknown>;
    settings.goalHours = sanitizeGoalHours(s.goalHours);
    settings.theme = s.theme === 'light' ? 'light' : 'dark';
    settings.chartRange = s.chartRange === 'total' ? 'total' : 'week';
    settings.historyFilter = typeof s.historyFilter === 'string' ? s.historyFilter : 'all';
  } else {
    // Support legacy top-level goalHours / theme / chartRange.
    if ('goalHours' in payload) settings.goalHours = sanitizeGoalHours(payload.goalHours);
    if (payload.theme === 'light') settings.theme = 'light';
    if (payload.chartRange === 'total') settings.chartRange = 'total';
  }

  // Drop sessions that reference subjects which no longer exist (except null).
  const subjectIds = new Set(subjects.map((s) => s.id));
  const cleanedSessions = sessions.filter((s) => s.subjectId === null || subjectIds.has(s.subjectId));

  return {
    version: SCHEMA_VERSION,
    subjects,
    sessions: cleanedSessions,
    timer: parseTimer(payload.timer),
    settings,
  };
}

/* ---------------------------------- public -------------------------------- */

/** Load state, freeze any running timer (pause-on-leave), and return it. */
export function loadState(): AppState {
  const store = browserStorage();
  if (!store) return defaultState();
  let raw: unknown = null;
  try {
    const text = store.getItem(STORAGE_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const state = normalizeState(raw);
  state.timer = timerDomain.freezeIfRunning(state.timer, Date.now());
  return state;
}

/** Persist state, trimming to the session cap. Returns true on success. */
export function saveState(state: AppState): boolean {
  const store = browserStorage();
  if (!store) return false;
  try {
    const bounded: AppState = {
      ...state,
      sessions: state.sessions.slice(0, 5000),
    };
    store.setItem(STORAGE_KEY, JSON.stringify(bounded));
    return true;
  } catch {
    return false; // quota exceeded or storage blocked
  }
}

/** Wipe all app data. */
export function clearState(): boolean {
  const store = browserStorage();
  if (!store) return false;
  try {
    store.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
