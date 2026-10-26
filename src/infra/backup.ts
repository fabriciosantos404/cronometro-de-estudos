/**
 * Backup — export the full state as JSON and import it back safely.
 * Import re-runs `normalizeState`, so malformed or hostile files can't
 * inject invalid data into the app.
 */
import { AppState } from '../domain/models';
import { normalizeState } from './storage';

export interface BackupFile {
  app: 'cronometro-de-estudos';
  exportedAt: string;
  data: AppState;
}

/** Serialize current state into a portable backup object. */
export function createBackup(state: AppState): BackupFile {
  return {
    app: 'cronometro-de-estudos',
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

/** Build a JSON string for download. */
export function toJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** Generate a filename with an ISO date, e.g. backup-2026-10-26.json. */
export function backupFilename(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `cronometro-estudos-backup-${d}.json`;
}

export type ImportResult =
  | { ok: true; state: AppState }
  | { ok: false; error: string };

/** Parse and validate an uploaded backup. Never throws on bad input. */
export function importBackup(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Arquivo inválido: não é um JSON válido.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Arquivo inválido: estrutura desconhecida.' };
  }

  const obj = parsed as Record<string, unknown>;
  // Accept both our wrapped backup and a raw AppState payload.
  const payload = obj.app === 'cronometro-de-estudos' && obj.data ? obj.data : parsed;

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Arquivo inválido: dados ausentes.' };
  }

  const state = normalizeState(payload);
  if (state.subjects.length === 0 && state.sessions.length === 0) {
    return { ok: false, error: 'Arquivo sem dados reconhecíveis.' };
  }
  return { ok: true, state };
}

/** Trigger a browser download of the backup JSON. */
export function downloadBackup(state: AppState): void {
  const json = toJson(createBackup(state));
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
