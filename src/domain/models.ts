/**
 * Domain models — the single source of truth for the app's data shapes.
 * Pure types + factories, no DOM or storage dependencies.
 */

export type Theme = 'dark' | 'light';
export type ChartRange = 'week' | 'total';
export type SessionSource = 'timer' | 'manual';

export interface Subject {
  id: string;
  name: string;
  color: string; // hex, e.g. "#7c5cff"
  createdAt: number;
}

export interface Session {
  id: string;
  subjectId: string | null; // null = "Geral" (sem matéria)
  durationSec: number; // always > 0 after validation
  at: number; // start timestamp (ms)
  note: string; // comment about the study session
  source: SessionSource;
}

export interface TimerState {
  running: boolean;
  subjectId: string | null;
  startedAt: number; // ms timestamp when the current run began (0 if paused)
  baseSec: number; // accumulated seconds from previous runs
  updatedAt: number;
}

export interface Settings {
  goalHours: number;
  theme: Theme;
  chartRange: ChartRange;
  historyFilter: string; // 'all' | subject id
}

export interface AppState {
  version: number;
  subjects: Subject[];
  sessions: Session[];
  timer: TimerState;
  settings: Settings;
}

/** Bump when the persisted shape changes; storage.ts runs migrations. */
export const SCHEMA_VERSION = 1;

export const PALETTE = [
  '#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185',
  '#f472b6', '#60a5fa', '#a3e635', '#f97316', '#14b8a6',
] as const;

export function defaultTimer(subjectId: string | null = null): TimerState {
  return { running: false, subjectId, startedAt: 0, baseSec: 0, updatedAt: 0 };
}

export function defaultSettings(): Settings {
  return { goalHours: 4, theme: 'dark', chartRange: 'week', historyFilter: 'all' };
}

export function defaultState(): AppState {
  return {
    version: SCHEMA_VERSION,
    subjects: [],
    sessions: [],
    timer: defaultTimer(),
    settings: defaultSettings(),
  };
}

/** Short, collision-resistant-enough id for a local, single-user app. */
export function makeId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${rand}`;
}
