/**
 * Chart — dependency-free horizontal bar chart rendered as accessible SVG.
 * Shows study hours per subject with an empty state.
 */
import { formatDuration } from '../../domain/time';
import { clear, el, mount, svg } from '../dom';

export interface ChartEntry {
  label: string;
  color: string;
  sec: number;
}

const EMPTY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 5.5-6.5"/><path d="M14 8.5h4.5V13"/></svg>';

/**
 * Render bars into `host`. `unit` controls the value label: full duration
 * ("1h 20min"). Rows are ordered descending and scaled to the max value.
 */
export function renderChart(host: HTMLElement, entries: ChartEntry[]): void {
  const data = entries.filter((e) => e.sec > 0).sort((a, b) => b.sec - a.sec);

  if (data.length === 0) {
    mount(host, [
      el('div', { class: 'chart-empty' }, [
        svg(EMPTY_ICON),
        el('p', { text: 'Ainda sem dados.' }),
        el('span', { text: 'Registre um estudo para ver as barras por matéria.' }),
      ]),
    ]);
    return;
  }

  const max = Math.max(...data.map((e) => e.sec), 1);
  const rows = data.map((entry) => {
    const pct = Math.max(2, Math.round((entry.sec / max) * 100));
    return el('div', { class: 'bar-row', role: 'listitem' }, [
      el('div', { class: 'bar-meta' }, [
        el('span', { class: 'bar-dot', style: `background:${entry.color}` }),
        el('span', { class: 'bar-label', text: entry.label, title: entry.label }),
        el('span', { class: 'bar-value', text: formatDuration(entry.sec) }),
      ]),
      el('div', { class: 'bar-track' }, [
        el('span', { class: 'bar-fill', style: `width:${pct}%;background:${entry.color}` }),
      ]),
    ]);
  });

  mount(host, [el('div', { class: 'chart-bars', role: 'list', 'aria-label': 'Horas por matéria' }, rows)]);
}

/** Remove existing chart content (used on teardown). */
export function clearChart(host: HTMLElement): void {
  clear(host);
}
