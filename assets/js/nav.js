import { reduceMotion, emitUi } from './env.js';

const root = document.documentElement;
const openers = new WeakMap();
let locked = false;
let savedY = 0;

// Scroll lock follows the real state of <dialog open>, however a dialog was closed
// (button, Esc, backdrop, form method="dialog").
function syncLock() {
  const anyOpen = Boolean(document.querySelector('dialog[open]'));
  if (anyOpen === locked) return;
  locked = anyOpen;
  if (anyOpen) {
    root.classList.add('is-locked');
  } else {
    root.classList.remove('is-locked');
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo(0, savedY);
  }
  emitUi();
}

const CLOSE_MS = 280;

// Every dialog fades/slides out before it really closes (Esc, ✕, backdrop, links inside).
function animateClosing(dlg) {
  const nativeClose = HTMLDialogElement.prototype.close.bind(dlg);
  dlg.close = (value) => {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    if (reduceMotion.matches) { nativeClose(value); return; }
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.classList.remove('is-closing'); nativeClose(value); }, CLOSE_MS);
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); });
}

function watchDialogs() {
  document.querySelectorAll('dialog').forEach(animateClosing);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const dlg = m.target;
      if (dlg.tagName !== 'DIALOG' || dlg.open) continue;
      const opener = openers.get(dlg);
      openers.delete(dlg);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }
    syncLock();
  }).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
}

export function openDialog(dlg, opener = document.activeElement) {
  if (!dlg || dlg.open) return;
  dlg.dispatchEvent(new CustomEvent('xl:open', { detail: { opener } }));
  if (!locked) savedY = window.scrollY;
  openers.set(dlg, opener);
  dlg.showModal();
  syncLock();
}

function closeOpenDialogs() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}

export function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const go = () => {
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    const heading = target.querySelector('h2[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
  };
  if (document.querySelector('dialog[open]')) {
    closeOpenDialogs();
    setTimeout(go, CLOSE_MS + 40); // after the closing animation and the scroll-lock release
  } else {
    go();
  }
}

function prefillService(name) {
  const field = document.getElementById('f-message');
  if (field && name && !field.value.trim()) field.value = `Интересует: ${name}. `;
}

export function initNav() {
  // F5 always opens the page from the top; anchors never stay in the URL.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
  watchDialogs();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-scroll], [data-scroll-top], [data-open], [data-close]');
    if (!t) return;

    if (t.hasAttribute('data-scroll-top')) {
      // Same page (domain root or GitHub Pages subfolder): scroll up instead of reloading.
      const target = new URL(t.getAttribute('href'), location.href).pathname.replace(/index\.html$/, '');
      if (target === location.pathname.replace(/index\.html$/, '')) {
        e.preventDefault();
        closeOpenDialogs();
        window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
      return;
    }
    if (t.hasAttribute('data-scroll')) {
      e.preventDefault();
      if (t.dataset.service) prefillService(t.dataset.service);
      scrollToSection(t.dataset.scroll);
      return;
    }
    if (t.hasAttribute('data-open')) {
      e.preventDefault();
      openDialog(document.getElementById(t.dataset.open), t);
      return;
    }
    if (t.hasAttribute('data-close')) {
      t.closest('dialog')?.close();
    }
  });

  // Click on the backdrop closes a dialog.
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('cancel');
    });
  });

  const header = document.getElementById('header');
  if (header) {
    let ticking = false;
    const update = () => {
      ticking = false;
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      // Which section sits right under the header bar decides its light/dark variant.
      // elementsFromPoint skips overlays (preloader, ambient layers) and looks at the page content.
      const probe = document.elementsFromPoint(window.innerWidth / 2, header.offsetHeight + 2)
        .find((el) => el.closest('main, footer'));
      header.classList.toggle('on-dark', Boolean(probe && probe.closest('[data-theme="dark"], [data-header="dark"]')));
    };
    const queue = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue, { passive: true });
    update();
  }

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}
