// In-site viewer: demo sites and legal documents open in a window over the page
// (same-origin <iframe> inside a <dialog>) instead of a new browser tab.
import { openDialog } from './nav.js';

const dlg = document.getElementById('viewer');
const frame = document.getElementById('viewer-frame');
const titleEl = document.getElementById('viewer-title');
const devices = document.getElementById('viewer-devices');
const foot = document.getElementById('viewer-foot');
const cta = document.getElementById('viewer-cta');

function sameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

// The page lives at 100% of the screen, so while the body morphs the demo re-lays itself out on
// every frame — it visibly shrinks into its phone layout (and back), like resizing a browser window.
// Weak devices switch instantly instead.
const weak = (navigator.hardwareConcurrency || 8) <= 4 || Boolean(navigator.connection && navigator.connection.saveData) ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

function setDevice(name) {
  devices.querySelectorAll('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === name)));
  dlg.classList.toggle('is-instant', weak);
  dlg.dataset.device = name;
  syncPhoneChrome();
}

// Inside the phone the demo gets overlay-style scrolling: no desktop scrollbar column at the edge.
function syncPhoneChrome() {
  try {
    const doc = frame.contentDocument;
    if (!doc || doc.URL === 'about:blank' || !doc.head) return;
    if (!doc.getElementById('xl-phone-style')) {
      const st = doc.createElement('style');
      st.id = 'xl-phone-style';
      st.textContent = 'html.xl-phone{scrollbar-width:none}html.xl-phone::-webkit-scrollbar,html.xl-phone body::-webkit-scrollbar{width:0;height:0;display:none}';
      doc.head.append(st);
    }
    doc.documentElement.classList.toggle('xl-phone', dlg.dataset.device === 'mobile');
  } catch { /* cross-origin page: leave it as is */ }
}

// Esc inside the demo closes the window as soon as its DOM exists (not only after every photo loads).
const escBound = new WeakSet();
function bindEsc() {
  try {
    const win = frame.contentWindow;
    if (!win || escBound.has(win) || frame.contentDocument.URL === 'about:blank') return;
    win.addEventListener('keydown', (e) => { if (e.key === 'Escape') dlg.close(); });
    escBound.add(win);
  } catch { /* cross-origin page: the close button still works */ }
}

// kind: 'example' — demo site (device switch + «Хочу такой же»), 'doc' — legal document.
export function openViewer({ url, title, kind = 'doc', service = '' }, opener) {
  if (!dlg || !sameOrigin(url)) return false;
  const isExample = kind === 'example';
  title = (title || '').replace(/^./, (ch) => ch.toUpperCase());
  titleEl.textContent = title;
  frame.title = title || 'Просмотр';
  devices.hidden = !isExample;
  foot.hidden = !isExample;
  cta.dataset.service = service;
  setDevice('desktop');
  dlg.classList.add('is-loading');
  frame.src = new URL(url, location.href).href;
  openDialog(dlg, opener);
  waitForDom();
  return true;
}

// Hide the loader once the page's DOM is ready — `load` would also wait for every photo.
let domTimer = 0;
function waitForDom() {
  clearInterval(domTimer);
  const started = performance.now();
  domTimer = setInterval(() => {
    let ready = false;
    try {
      const doc = frame.contentDocument;
      ready = doc && doc.URL !== 'about:blank' && doc.readyState !== 'loading';
    } catch {
      ready = true; // cross-origin: cannot inspect, show it
    }
    if (ready || performance.now() - started > 4000) {
      clearInterval(domTimer);
      bindEsc();
      syncPhoneChrome();
      dlg.classList.remove('is-loading');
    }
  }, 80);
}

export function initViewer() {
  if (!dlg || !frame) return;

  frame.addEventListener('load', () => {
    if (frame.src === 'about:blank') return;
    dlg.classList.remove('is-loading');
    bindEsc();
    syncPhoneChrome();
  });

  dlg.addEventListener('close', () => {
    clearInterval(domTimer);
    frame.src = 'about:blank';
  });

  devices.addEventListener('click', (e) => {
    const b = e.target.closest('[data-device]');
    if (b) setDevice(b.dataset.device);
  });

  // Document links (privacy, consent, offer) open in the viewer; Ctrl/⌘/Shift-click keeps the browser default.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-viewer]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    if (openViewer({ url: a.href, title: a.dataset.viewerTitle || a.textContent.trim(), kind: 'doc' }, a)) e.preventDefault();
  });
}
