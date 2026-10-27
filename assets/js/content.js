// Loads /data/content.json and applies it to [data-c] / [data-c-href] nodes.
// Only textContent and validated hrefs are written — never innerHTML.

const SAFE_HREF = /^(tel:\+?[\d\-()\s]+|mailto:[^\s<>"]+|https:\/\/[^\s<>"]+|\/[^\s<>"]*)$/i;

let cache = null;

export function loadContent() {
  if (!cache) {
    cache = fetch('/data/content.json', { cache: 'no-cache', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cache;
}

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function safeHref(value) {
  return typeof value === 'string' && SAFE_HREF.test(value.trim()) ? value.trim() : null;
}

export function hydrate(data, root = document, { onSplit } = {}) {
  if (!data) return;
  root.querySelectorAll('[data-c]').forEach((el) => {
    const v = get(data, el.dataset.c);
    if (typeof v !== 'string' && typeof v !== 'number') return;
    const text = String(v);
    if ((el.hasAttribute('data-split') || el.hasAttribute('data-type')) && onSplit) {
      onSplit(el, text);
    } else if (el.textContent !== text) {
      el.textContent = text;
    }
  });
  root.querySelectorAll('[data-c-href]').forEach((el) => {
    const href = safeHref(get(data, el.dataset.cHref));
    if (href) el.setAttribute('href', href);
  });
}

// Tiny DOM builder: h('p', { class: 'x' }, 'text', child)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Icons: static path data only (never from content.json).
const ICONS = {
  arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  landing: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['path', { d: 'M3 8.5h18M7 12.5h6M7 15.5h10' }]],
  corporate: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['path', { d: 'M3 8.5h18M9 8.5V20M12.5 12h5M12.5 15h5' }]],
  refine: [['path', { d: 'M4 7h10M18 7h2M4 17h4M12 17h8' }], ['circle', { cx: 16, cy: 7, r: 2 }], ['circle', { cx: 10, cy: 17, r: 2 }]],
  support: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 3.5 }], ['path', { d: 'M6.3 6.3l3.2 3.2M14.5 14.5l3.2 3.2M17.7 6.3l-3.2 3.2M9.5 14.5l-3.2 3.2' }]],
  phone: [['path', { d: 'M6.6 3.5h2.6l1.5 4-2 1.3a12 12 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z' }]],
  mail: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'M3.5 6.5l8.5 6.5 8.5-6.5' }]],
};

export function icon(name, size = 24, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  for (const [tag, attrs] of ICONS[name] || ICONS.landing) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}
