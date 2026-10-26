/**
 * Toast notifications — non-blocking, accessible (aria-live), auto-dismiss.
 */
import { el, svg } from '../dom';

export type ToastKind = 'info' | 'success' | 'error';

const ICONS: Record<ToastKind, string> = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
};

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.getElementById('toasts') ?? document.body.appendChild(el('div', { id: 'toasts' }));
  }
  return container;
}

/** Show a toast. Text is set via textContent (safe for any input). */
export function toast(message: string, kind: ToastKind = 'info', duration = 3200): void {
  const host = ensureContainer();
  const node = el(
    'div',
    { class: `toast toast-${kind}`, role: 'status' },
    [
      el('span', { class: 'toast-icon' }, [svg(ICONS[kind])]),
      el('span', { class: 'toast-msg', text: message }),
    ],
  );
  host.appendChild(node);
  // Enter animation on next frame.
  requestAnimationFrame(() => node.classList.add('show'));
  const dismiss = () => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 240);
  };
  const timer = setTimeout(dismiss, duration);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
}
