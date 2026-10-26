/**
 * Modal controller — accessible dialog with focus trap, ESC/backdrop close,
 * scroll lock, and focus restoration. Content is provided by the caller.
 */
export interface Modal {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createModal(root: HTMLElement, onOpen?: () => void): Modal {
  const panel = root.querySelector<HTMLElement>('.modal-panel')!;
  let isOpen = false;
  let lastFocused: HTMLElement | null = null;

  function focusables(): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    );
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = focusables();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    lastFocused = document.activeElement as HTMLElement | null;
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKeydown);
    onOpen?.();
    const target = focusables()[0] ?? panel;
    target.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKeydown);
    lastFocused?.focus?.();
  }

  // Backdrop / [data-close] wiring.
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-close]') || target.closest('[data-close]') === target) close();
  });
  root.querySelectorAll('[data-close]').forEach((n) => {
    n.addEventListener('click', () => close());
  });

  return { open, close, get isOpen() { return isOpen; } };
}
