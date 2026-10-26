/**
 * DOM helpers — XSS-safe element construction.
 *
 * Golden rule: user-controlled strings always go through `textContent`
 * (via `t()` or `props.text`), never `innerHTML`. `svg()` is reserved for
 * trusted, app-authored markup only.
 */

export interface ElProps {
  text?: string;
  class?: string;
  dataset?: Record<string, string>;
  on?: Partial<Record<keyof GlobalEventHandlersEventMap, EventListener>>;
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | Record<string, string>
    | EventListener
    | Partial<Record<keyof GlobalEventHandlersEventMap, EventListener>>
    | undefined;
}

/** Create an element with attributes, dataset, listeners and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { text, dataset, on, ...rest } = props;

  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      // handled by `on` map; ignore stray function props
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  if (text !== undefined) node.textContent = text;
  if (on) {
    for (const [evt, handler] of Object.entries(on)) {
      if (handler) node.addEventListener(evt, handler);
    }
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Shorthand for setting text safely. */
export function t(node: Node, value: string): void {
  node.textContent = value;
}

/** Remove all children of a node. */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replace children in one shot. */
export function mount(parent: Element, children: (Node | string | null | undefined)[]): void {
  clear(parent);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/**
 * Trusted, app-authored inline SVG. The input MUST be a static string
 * authored in this codebase — never pass user data here.
 */
export function svg(markup: string, className?: string): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild as SVGSVGElement | null;
  if (!node) throw new Error('svg markup must produce an element');
  if (className) node.setAttribute('class', className);
  return node;
}

/** Read a CSS custom property (used to read theme colors). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
