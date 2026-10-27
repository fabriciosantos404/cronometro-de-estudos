/**
 * Application composition root.
 *
 * Responsibilities:
 *  - Own the single AppState, persist on every mutation (`commit`).
 *  - Structural re-render (`renderAll`) vs. lightweight per-tick update
 *    (`renderLive`) so the clock stays smooth without rebuilding the DOM.
 *  - "Pause on leave": freeze on `pagehide` (closing the site); switching
 *    tabs keeps counting, and the clock is mirrored into the tab title.
 *
 * All user strings are written through `textContent` (see dom.ts) — no
 * user data ever reaches `innerHTML`.
 */
import * as stats from '../domain/stats';
import * as time from '../domain/time';
import * as timerDomain from '../domain/timer';
import * as v from '../domain/validation';
import {
  AppState,
  PALETTE,
  Session,
  Subject,
  makeId,
} from '../domain/models';
import { downloadBackup, importBackup } from '../infra/backup';
import { loadState, saveState } from '../infra/storage';
import { renderChart } from './components/chart';
import { createModal } from './components/modal';
import { toast } from './components/toast';
import { el, mount, svg } from './dom';

const TRASH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7"/></svg>';
const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento obrigatório ausente: #${id}`);
  return node as T;
}

/** Original page title, restored in the tab whenever the clock is at zero. */
const BASE_TITLE = document.title;
/** Ticks between progress checkpoints persisted while running (120 × 250 ms = 30 s). */
const HEARTBEAT_TICKS = 120;

/** Local date "YYYY-MM-DD" for <input type="date">. */
function toDateInput(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export class App {
  private state: AppState;
  private editingNoteId: string | null = null;
  private editingSubjectId: string | null = null;
  private lastTitle = ''; // avoids rewriting document.title on every tick

  // --- cached DOM ---
  private timerDisplay = byId('timerDisplay');
  private timerState = byId('timerState');
  private timerSubjectLabel = byId('timerSubjectLabel');
  private playBtn = byId<HTMLButtonElement>('playBtn');
  private playLabel = byId('playLabel');
  private resetBtn = byId<HTMLButtonElement>('resetBtn');
  private manualBtn = byId<HTMLButtonElement>('manualBtn');
  private subjectChips = byId('subjectChips');
  private goalText = byId('goalText');
  private goalBar = byId('goalBar');
  private goalInput = byId<HTMLInputElement>('goalInput');
  private chartHost = byId('chart');
  private subjectList = byId('subjectList');
  private subjectCount = byId('subjectCount');
  private subjectForm = byId<HTMLFormElement>('subjectForm');
  private subjectName = byId<HTMLInputElement>('subjectName');
  private subjectColor = byId<HTMLInputElement>('subjectColor');
  private swatches = byId('swatches');
  private history = byId('history');
  private historyFoot = byId('historyFoot');
  private historyFilter = byId<HTMLSelectElement>('historyFilter');
  private clearHistory = byId<HTMLButtonElement>('clearHistory');
  private lastMeta = byId('lastMeta');
  private lastNoteText = byId<HTMLTextAreaElement>('lastNoteText');
  private lastNoteSave = byId<HTMLButtonElement>('lastNoteSave');
  private lastEmpty = byId('lastEmpty');
  private lastEditor = byId('lastEditor');
  private themeBtn = byId<HTMLButtonElement>('themeBtn');
  private exportBtn = byId<HTMLButtonElement>('exportBtn');
  private importBtn = byId<HTMLButtonElement>('importBtn');
  private importFile = byId<HTMLInputElement>('importFile');
  private autosave = byId('autosave');

  // --- manual modal ---
  private manualModal = createModal(byId('manualModal'), () => this.primeManualForm());
  private manualForm = byId<HTMLFormElement>('manualForm');
  private mSubject = byId<HTMLSelectElement>('mSubject');
  private mHours = byId<HTMLInputElement>('mHours');
  private mMinutes = byId<HTMLInputElement>('mMinutes');
  private mDate = byId<HTMLInputElement>('mDate');
  private mNote = byId<HTMLInputElement>('mNote');

  constructor() {
    this.state = loadState();
    this.applyTheme();
    this.bindEvents();
    this.renderAll();
    this.startTicking();
  }

  /* ------------------------------- utilities ------------------------------ */

  /** Sessions including a virtual entry for the in-progress run (live stats). */
  private displaySessions(): Session[] {
    const { timer } = this.state;
    if (!timer.running) return this.state.sessions;
    const elapsed = timerDomain.elapsedSec(timer, Date.now());
    if (elapsed <= 0) return this.state.sessions;
    const virtual: Session = {
      id: '__live__',
      subjectId: timer.subjectId,
      durationSec: elapsed,
      at: Date.now(),
      note: '',
      source: 'timer',
    };
    return [...this.state.sessions, virtual];
  }

  /** Mutate → persist → re-render structurally. */
  private commit(mutate?: (s: AppState) => void): void {
    if (mutate) mutate(this.state);
    const ok = saveState(this.state);
    if (!ok) this.flashAutosave(false);
    this.renderAll();
  }

  private flashAutosave(ok: boolean): void {
    if (!this.autosave) return;
    this.autosave.classList.toggle('warn', !ok);
    this.autosave.lastChild && (this.autosave.lastChild.textContent = ok ? ' Salvo neste navegador' : ' Falha ao salvar');
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.state.settings.theme;
    this.themeBtn.setAttribute(
      'aria-label',
      this.state.settings.theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro',
    );
  }

  private subjectById(id: string | null): Subject | undefined {
    if (!id) return undefined;
    return this.state.subjects.find((s) => s.id === id);
  }

  private subjectLabel(id: string | null): string {
    return this.subjectById(id)?.name ?? 'Geral';
  }

  /* -------------------------------- rendering ------------------------------ */

  private renderAll(): void {
    this.renderStats();
    this.renderTimerChrome();
    this.renderChips();
    this.renderGoal();
    this.renderChartView();
    this.renderSubjectSelects();
    this.renderSubjectList();
    this.renderHistory();
    this.renderLastStudy();
    this.syncRangeButtons();
    this.flashAutosave(true);
  }

  /** Called on every tick: cheap text/width writes only. */
  private renderLive(): void {
    const now = Date.now();
    const { timer } = this.state;
    const elapsed = timerDomain.elapsedSec(timer, now);
    this.timerDisplay.textContent = time.formatClock(elapsed);
    this.timerState.classList.toggle('active', timer.running);
    this.timerState.childNodes[1] &&
      (this.timerState.childNodes[1].textContent = timer.running ? ' Estudando' : elapsed > 0 ? ' Pausado' : ' Parado');
    this.playLabel.textContent = timer.running ? 'Pausar' : 'Iniciar';
    this.playBtn.dataset.running = String(timer.running);
    this.playBtn.setAttribute('aria-label', timer.running ? 'Pausar cronômetro' : 'Iniciar cronômetro');
    this.renderTabTitle(elapsed);
    this.renderStats();
    this.renderGoal();
  }

  /** Mirror the clock into the browser tab title (next to the favicon). */
  private renderTabTitle(elapsed: number): void {
    const next =
      elapsed <= 0 ? BASE_TITLE : `${time.formatClock(elapsed)} · Focus`;
    if (next === this.lastTitle) return;
    this.lastTitle = next;
    document.title = next;
  }

  private renderStats(): void {
    const display = this.displaySessions();
    const now = Date.now();
    byId('statTotal').textContent = time.formatDuration(stats.totalSec(display));
    byId('statToday').textContent = time.formatDuration(stats.todaySec(display, now));
    byId('statWeek').textContent = time.formatDuration(stats.weekSec(display, now));
    byId('statStreak').textContent = `${stats.streakDays(display, now)} ${stats.streakDays(display, now) === 1 ? 'dia' : 'dias'}`;
    byId('statSessions').textContent = `${this.state.sessions.length} ${this.state.sessions.length === 1 ? 'sessão' : 'sessões'}`;
  }

  private renderTimerChrome(): void {
    const { timer } = this.state;
    this.timerSubjectLabel.textContent = this.subjectLabel(timer.subjectId);
  }

  private renderChips(): void {
    const { timer } = this.state;
    const items: HTMLElement[] = [];
    const mk = (id: string | null, label: string, color: string | null) => {
      const active = timer.subjectId === id;
      const chip = el('button', {
        class: `chip${active ? ' active' : ''}`,
        type: 'button',
        'aria-pressed': String(active),
        on: { click: () => this.commit((s) => { s.timer = timerDomain.setSubject(s.timer, id); }) },
      });
      if (color) chip.appendChild(el('i', { class: 'chip-dot', style: `background:${color}` }));
      chip.appendChild(document.createTextNode(label));
      return chip;
    };
    items.push(mk(null, 'Geral', null));
    for (const s of this.state.subjects) items.push(mk(s.id, s.name, s.color));
    mount(this.subjectChips, items);
  }

  private renderGoal(): void {
    const goalSec = this.state.settings.goalHours * 3600;
    const today = stats.todaySec(this.displaySessions(), Date.now());
    const pct = goalSec > 0 ? Math.min(100, Math.max(0, (today / goalSec) * 100)) : 0;
    this.goalText.textContent = `${time.formatDuration(today)} / ${time.formatDuration(goalSec)}`;
    this.goalBar.style.width = `${pct}%`;
    this.goalBar.parentElement?.classList.toggle('done', pct >= 100);
    if (document.activeElement !== this.goalInput) {
      this.goalInput.value = String(this.state.settings.goalHours);
    }
  }

  private renderChartView(): void {
    const { subjects, settings } = this.state;
    const map =
      settings.chartRange === 'week'
        ? stats.weekBySubject(this.displaySessions(), subjects)
        : stats.totalBySubject(this.displaySessions(), subjects);
    const entries = subjects.map((s) => ({
      label: s.name,
      color: s.color,
      sec: map.get(s.id) ?? 0,
    }));
    renderChart(this.chartHost, entries);
  }

  private syncRangeButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      const active = btn.dataset.range === this.state.settings.chartRange;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  private renderSubjectSelects(): void {
    const currentFilter = this.state.settings.historyFilter;
    const filterOptions = [
      el('option', { value: 'all', text: 'Todas as matérias' }),
      ...this.state.subjects.map((s) => el('option', { value: s.id, text: s.name })),
    ];
    mount(this.historyFilter, filterOptions);
    this.historyFilter.value = this.state.subjects.some((s) => s.id === currentFilter) ? currentFilter : 'all';

    mount(this.mSubject, [
      el('option', { value: '', text: 'Geral (sem matéria)' }),
      ...this.state.subjects.map((s) => el('option', { value: s.id, text: s.name })),
    ]);
  }

  private subjectTotal(subjectId: string): number {
    return this.state.sessions
      .filter((s) => s.subjectId === subjectId)
      .reduce((sum, s) => sum + s.durationSec, 0);
  }

  private renderSubjectList(): void {
    const count = this.state.subjects.length;
    this.subjectCount.textContent = `${count} ${count === 1 ? 'cadastrada' : 'cadastradas'}`;

    if (count === 0) {
      mount(this.subjectList, [
        el('li', { class: 'empty-inline', text: 'Nenhuma matéria ainda. Cadastre a primeira acima.' }),
      ]);
      return;
    }

    const rows = this.state.subjects.map((subject) => {
      const nameNode =
        this.editingSubjectId === subject.id ? null : el('span', { class: 'subj-name', text: subject.name });

      const row = el('li', { class: 'subj-row', dataset: { id: subject.id } }, [
        el('span', { class: 'subj-dot', style: `background:${subject.color}` }),
        nameNode ?? this.buildSubjectNameEditor(subject),
        el('span', { class: 'subj-total', text: time.formatDuration(this.subjectTotal(subject.id)) }),
        ...(this.editingSubjectId === subject.id
          ? []
          : [
              el('button', {
                class: 'icon-btn sm',
                type: 'button',
                title: 'Editar nome',
                'aria-label': `Editar ${subject.name}`,
                on: { click: () => { this.editingSubjectId = subject.id; this.renderSubjectList(); } },
              }, [svg(PENCIL_ICON)]),
            ]),
        this.buildColorInput(subject),
        el('button', {
          class: 'icon-btn sm danger',
          type: 'button',
          title: 'Excluir matéria',
          'aria-label': `Excluir ${subject.name}`,
          on: { click: () => this.deleteSubject(subject) },
        }, [svg(TRASH_ICON)]),
      ]);
      return row;
    });
    mount(this.subjectList, rows);
  }

  private buildSubjectNameEditor(subject: Subject): HTMLElement {
    const input = el('input', {
      class: 'subj-edit-input',
      type: 'text',
      maxlength: String(v.LIMITS.subjectName),
      value: subject.name,
      'aria-label': 'Novo nome da matéria',
    });
    const commitName = () => {
      const name = v.sanitizeSubjectName(input.value);
      if (!name) { toast('Nome inválido.', 'error'); return; }
      const dup = v.isDuplicateSubject(
        name,
        this.state.subjects.filter((s) => s.id !== subject.id).map((s) => s.name),
      );
      if (dup) { toast('Já existe uma matéria com esse nome.', 'error'); return; }
      this.editingSubjectId = null;
      this.commit((s) => {
        const target = s.subjects.find((x) => x.id === subject.id);
        if (target) target.name = name;
      });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitName(); }
      if (e.key === 'Escape') { this.editingSubjectId = null; this.renderSubjectList(); }
    });
    input.addEventListener('blur', () => { if (this.editingSubjectId === subject.id) commitName(); });
    queueMicrotask(() => input.focus());
    return el('span', { class: 'subj-edit-wrap' }, [input]);
  }

  private buildColorInput(subject: Subject): HTMLInputElement {
    const input = el('input', {
      class: 'row-color',
      type: 'color',
      value: subject.color,
      'aria-label': `Cor de ${subject.name}`,
      title: 'Alterar cor',
    }) as HTMLInputElement;
    // `change` (not `input`) avoids re-render mid-drag.
    input.addEventListener('change', () => {
      this.commit((s) => {
        const target = s.subjects.find((x) => x.id === subject.id);
        if (target) target.color = v.sanitizeColor(input.value, target.color);
      });
    });
    return input;
  }

  private renderHistory(): void {
    const filter = this.state.settings.historyFilter;
    const filtered = this.state.sessions
      .filter((s) => filter === 'all' || s.subjectId === filter)
      .sort((a, b) => b.at - a.at);

    if (filtered.length === 0) {
      mount(this.history, [el('div', { class: 'empty-state', text: 'Nenhum estudo registrado ainda.' })]);
      this.historyFoot.textContent = '';
      return;
    }

    const rows = filtered.map((session) => this.buildHistoryRow(session));
    mount(this.history, rows);
    const sum = filtered.reduce((acc, s) => acc + s.durationSec, 0);
    this.historyFoot.textContent = `${filtered.length} ${filtered.length === 1 ? 'registro' : 'registros'} · ${time.formatDuration(sum)}`;
  }

  private buildHistoryRow(session: Session): HTMLElement {
    const subject = this.subjectById(session.subjectId);
    const color = subject?.color ?? '#94a3b8';
    const label = subject?.name ?? 'Geral';
    const editing = this.editingNoteId === session.id;

    const noteArea = editing
      ? this.buildNoteEditor(session)
      : el('p', {
          class: `hist-note${session.note ? '' : ' placeholder'}`,
          text: session.note || 'Sem comentário',
        });

    return el('li', { class: 'hist-row', dataset: { id: session.id } }, [
      el('span', { class: 'hist-dot', style: `background:${color}` }),
      el('div', { class: 'hist-main' }, [
        el('div', { class: 'hist-top' }, [
          el('span', { class: 'hist-subject', text: label }),
          el('span', { class: 'hist-dur', text: time.formatDuration(session.durationSec) }),
        ]),
        el('div', { class: 'hist-meta' }, [
          el('span', { text: `${time.formatRelativeDate(session.at)} · ${time.formatTime(session.at)}` }),
          el('span', { class: `src src-${session.source}`, text: session.source === 'manual' ? 'manual' : 'cronômetro' }),
        ]),
        noteArea,
      ]),
      el('div', { class: 'hist-actions' }, [
        el('button', {
          class: 'icon-btn sm',
          type: 'button',
          title: editing ? 'Fechar edição' : 'Editar comentário',
          'aria-label': 'Editar comentário',
          on: {
            click: () => {
              this.editingNoteId = editing ? null : session.id;
              this.renderHistory();
            },
          },
        }, [svg(PENCIL_ICON)]),
        el('button', {
          class: 'icon-btn sm danger',
          type: 'button',
          title: 'Excluir registro',
          'aria-label': 'Excluir registro',
          on: { click: () => this.deleteSession(session) },
        }, [svg(TRASH_ICON)]),
      ]),
    ]);
  }

  private buildNoteEditor(session: Session): HTMLElement {
    const textarea = el('textarea', {
      class: 'note-input',
      rows: '2',
      maxlength: String(v.LIMITS.note),
      'aria-label': 'Comentário do estudo',
      text: session.note,
    }) as HTMLTextAreaElement;
    const save = () => {
      const note = v.sanitizeNote(textarea.value);
      this.editingNoteId = null;
      this.commit((s) => {
        const target = s.sessions.find((x) => x.id === session.id);
        if (target) target.note = note;
      });
      toast('Comentário salvo.', 'success', 2000);
    };
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') { this.editingNoteId = null; this.renderHistory(); }
    });
    queueMicrotask(() => textarea.focus());
    return el('div', { class: 'note-edit' }, [
      textarea,
      el('div', { class: 'note-edit-actions' }, [
        el('button', { class: 'btn btn-primary btn-xs', type: 'button', text: 'Salvar', on: { click: save } }),
        el('button', {
          class: 'btn btn-ghost btn-xs', type: 'button', text: 'Cancelar',
          on: { click: () => { this.editingNoteId = null; this.renderHistory(); } },
        }),
      ]),
    ]);
  }

  private renderLastStudy(): void {
    const latest = stats.latestSession(this.state.sessions);
    if (!latest) {
      this.lastEditor.hidden = true;
      this.lastEmpty.hidden = false;
      return;
    }
    this.lastEmpty.hidden = true;
    this.lastEditor.hidden = false;
    const subject = this.subjectById(latest.subjectId);
    this.lastMeta.textContent = `${subject?.name ?? 'Geral'} · ${time.formatDuration(latest.durationSec)} · ${time.formatRelativeDate(latest.at)}`;
    if (document.activeElement !== this.lastNoteText) {
      this.lastNoteText.value = latest.note;
    }
  }

  /* --------------------------------- actions ------------------------------- */

  private addSubject(nameRaw: string, colorRaw: string): void {
    const name = v.sanitizeSubjectName(nameRaw);
    if (!name) { toast('Informe um nome para a matéria.', 'error'); return; }
    if (v.isDuplicateSubject(name, this.state.subjects.map((s) => s.name))) {
      toast('Já existe uma matéria com esse nome.', 'error');
      return;
    }
    const subject: Subject = { id: makeId(), name, color: v.sanitizeColor(colorRaw), createdAt: Date.now() };
    this.commit((s) => { s.subjects.push(subject); });
    this.subjectName.value = '';
    toast(`Matéria "${name}" adicionada.`, 'success');
  }

  private deleteSubject(subject: Subject): void {
    const affected = this.state.sessions.filter((s) => s.subjectId === subject.id).length;
    const detail = affected > 0 ? ` Os ${affected} estudos serão movidos para "Geral".` : '';
    if (!confirm(`Excluir a matéria "${subject.name}"?${detail}`)) return;
    this.commit((s) => {
      s.subjects = s.subjects.filter((x) => x.id !== subject.id);
      for (const session of s.sessions) if (session.subjectId === subject.id) session.subjectId = null;
      if (s.timer.subjectId === subject.id) s.timer = timerDomain.setSubject(s.timer, null);
      if (s.settings.historyFilter === subject.id) s.settings.historyFilter = 'all';
    });
    if (this.editingSubjectId === subject.id) this.editingSubjectId = null;
    toast('Matéria excluída.', 'info');
  }

  private deleteSession(session: Session): void {
    if (!confirm('Excluir este registro de estudo?')) return;
    this.commit((s) => { s.sessions = s.sessions.filter((x) => x.id !== session.id); });
    if (this.editingNoteId === session.id) this.editingNoteId = null;
    toast('Registro excluído.', 'info');
  }

  private toggleTimer(): void {
    const now = Date.now();
    this.commit((s) => {
      s.timer = s.timer.running ? timerDomain.pause(s.timer, now) : timerDomain.start(s.timer, now);
    });
    this.renderLive();
  }

  private resetTimer(): void {
    const now = Date.now();
    const { timer } = this.state;
    const elapsed = timerDomain.elapsedSec(timer, now);
    if (elapsed <= 0) { toast('Nenhum tempo para registrar.', 'info'); return; }

    const session: Session = {
      id: makeId(),
      subjectId: timer.subjectId,
      durationSec: Math.round(elapsed),
      at: now,
      note: '',
      source: 'timer',
    };
    this.commit((s) => {
      s.sessions.unshift(session);
      s.timer = timerDomain.reset(s.timer, now);
    });
    this.editingNoteId = null;
    toast(`Registrado ${time.formatDuration(session.durationSec)}.`, 'success');
    // Guide the user to comment on the study they just finished.
    this.lastNoteText.focus();
  }

  private addManualSession(): void {
    const hours = v.clampNumber(this.mHours.value, 0, v.LIMITS.maxManualHours, 0);
    const minutes = v.clampNumber(this.mMinutes.value, 0, v.LIMITS.maxManualMinutes, 0);
    const durationSec = Math.round(hours * 3600 + minutes * 60);
    if (durationSec <= 0) { toast('Informe um tempo maior que zero.', 'error'); return; }

    // Parse "YYYY-MM-DD" as local noon to avoid UTC off-by-one.
    let at = Date.now();
    const dateStr = this.mDate.value;
    if (dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (y && m && d) {
        const parsed = new Date(y, m - 1, d, 12, 0, 0, 0);
        if (!Number.isNaN(parsed.getTime())) at = parsed.getTime();
      }
    }

    const subjectId = this.mSubject.value || null;
    const session: Session = {
      id: makeId(),
      subjectId: subjectId && this.subjectById(subjectId) ? subjectId : null,
      durationSec,
      at,
      note: v.sanitizeNote(this.mNote.value),
      source: 'manual',
    };
    this.commit((s) => { s.sessions.unshift(session); });
    this.manualModal.close();
    toast('Tempo registrado.', 'success');
  }

  private saveLastNote(): void {
    const latest = stats.latestSession(this.state.sessions);
    if (!latest) return;
    const note = v.sanitizeNote(this.lastNoteText.value);
    this.commit((s) => {
      const target = s.sessions.find((x) => x.id === latest.id);
      if (target) target.note = note;
    });
    toast('Comentário salvo.', 'success', 2200);
  }

  private primeManualForm(): void {
    this.mDate.value = toDateInput();
    this.mHours.value = '0';
    this.mMinutes.value = '30';
    this.mNote.value = '';
    this.renderSubjectSelects();
  }

  private async handleImport(file: File): Promise<void> {
    try {
      const text = await file.text();
      const result = importBackup(text);
      if (!result.ok) { toast(result.error, 'error', 4000); return; }
      this.state = result.state;
      this.editingNoteId = null;
      this.editingSubjectId = null;
      this.applyTheme();
      this.commit();
      toast('Backup restaurado com sucesso.', 'success');
    } catch {
      toast('Não foi possível ler o arquivo.', 'error');
    }
  }

  /* --------------------------------- wiring -------------------------------- */

  private startTicking(): void {
    let ticks = 0;
    const loop = () => {
      this.renderLive();
      // Heartbeat: fold progress into the persisted state so an abrupt close
      // (crash, tab killed by the OS) loses at most one checkpoint interval.
      if (++ticks >= HEARTBEAT_TICKS) {
        ticks = 0;
        if (this.state.timer.running) {
          this.state.timer = timerDomain.checkpoint(this.state.timer, Date.now());
          saveState(this.state);
        }
      }
    };
    loop();
    window.setInterval(loop, 250);
  }

  /** Freeze the clock when the site is closed or reloaded (`pagehide`). */
  private pauseOnLeave(): void {
    if (!this.state.timer.running) return;
    const now = Date.now();
    this.state.timer = timerDomain.pause(this.state.timer, now);
    saveState(this.state);
    this.renderAll();
  }

  private bindEvents(): void {
    this.playBtn.addEventListener('click', () => this.toggleTimer());
    this.resetBtn.addEventListener('click', () => this.resetTimer());
    this.manualBtn.addEventListener('click', () => this.manualModal.open());

    this.subjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addSubject(this.subjectName.value, this.subjectColor.value);
    });

    this.goalInput.addEventListener('change', () => {
      this.commit((s) => { s.settings.goalHours = v.sanitizeGoalHours(this.goalInput.value); });
    });

    this.historyFilter.addEventListener('change', () => {
      this.commit((s) => { s.settings.historyFilter = this.historyFilter.value; });
    });

    this.clearHistory.addEventListener('click', () => {
      if (this.state.sessions.length === 0) { toast('Histórico já está vazio.', 'info'); return; }
      if (!confirm('Apagar TODO o histórico de estudos? Esta ação não pode ser desfeita.')) return;
      this.commit((s) => { s.sessions = []; });
      this.editingNoteId = null;
      toast('Histórico limpo.', 'info');
    });

    document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.commit((s) => { s.settings.chartRange = btn.dataset.range === 'total' ? 'total' : 'week'; });
      });
    });

    this.themeBtn.addEventListener('click', () => {
      this.commit((s) => { s.settings.theme = s.settings.theme === 'dark' ? 'light' : 'dark'; });
      this.applyTheme();
    });

    this.manualForm.addEventListener('submit', (e) => { e.preventDefault(); this.addManualSession(); });

    this.lastNoteSave.addEventListener('click', () => this.saveLastNote());
    this.lastNoteText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveLastNote(); }
    });

    this.exportBtn.addEventListener('click', () => {
      downloadBackup(this.state);
      toast('Backup exportado.', 'success');
    });
    this.importBtn.addEventListener('click', () => this.importFile.click());
    this.importFile.addEventListener('change', () => {
      const file = this.importFile.files?.[0];
      if (file) void this.handleImport(file);
      this.importFile.value = '';
    });

    // Keyboard shortcut: space toggles the timer (unless typing / modal open).
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (typing || this.manualModal.isOpen || (target as HTMLElement)?.closest('.modal.open')) return;
      e.preventDefault();
      this.toggleTimer();
    });

    // Tab switches are NOT a pause — the clock keeps counting from timestamps.
    // When the tab is hidden, checkpoint progress (so a killed tab loses at
    // most one interval) and refresh the tab title with an accurate value,
    // even while background timers are throttled.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now();
        this.state.timer = timerDomain.checkpoint(this.state.timer, now);
        saveState(this.state);
        this.renderLive();
      } else {
        this.renderLive();
      }
    });
    // Closing/reloading the site freezes the timer and persists the time.
    window.addEventListener('pagehide', () => this.pauseOnLeave());

    // Swatches for the subject color picker.
    PALETTE.forEach((hex) => {
      const swatch = el('button', {
        class: 'swatch',
        type: 'button',
        style: `background:${hex}`,
        'aria-label': `Cor ${hex}`,
        dataset: { color: hex },
        on: { click: () => { this.subjectColor.value = hex; this.syncSwatchActive(); } },
      });
      this.swatches.appendChild(swatch);
    });
    this.subjectColor.addEventListener('change', () => this.syncSwatchActive());
    this.syncSwatchActive();
  }

  private syncSwatchActive(): void {
    const current = this.subjectColor.value.toLowerCase();
    this.swatches.querySelectorAll<HTMLElement>('.swatch').forEach((node) => {
      node.classList.toggle('active', node.dataset.color?.toLowerCase() === current);
    });
  }
}
