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

// Buttons that lead to the form can pre-fill it: the service and a short brief (quiz answers,
// a question for Makar). Lines written by the site are replaced; the visitor's own text stays.
const AUTO_LINE = /^(Интересует: |Подбор формата: |Вопрос: )/;
function prefill(service, brief) {
  const field = document.getElementById('f-message');
  if (!field || (!service && !brief)) return;
  const own = field.value.split('\n').filter((line) => !AUTO_LINE.test(line)).join('\n').trim();
  const auto = [service && `Интересует: ${service}.`, brief].filter(Boolean).join('\n');
  field.value = (own ? `${auto}\n${own}` : `${auto}\n`).slice(0, field.maxLength > 0 ? field.maxLength : 2000);
}

// A short confirmation at the bottom of the screen (copy to clipboard and similar).
let toastTimer = 0;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-in'), 2200);
}

async function copyNear(btn) {
  const source = btn.parentElement && btn.parentElement.querySelector('a, .contacts__big');
  const value = source ? source.textContent.trim() : '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast(`Скопировано: ${value}`);
  } catch {
    toast(value);
  }
}

export function initNav() {
  // F5 always opens the page from the top; anchors never stay in the URL.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
  watchDialogs();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-scroll], [data-scroll-top], [data-open], [data-close], [data-copy]');
    if (!t) return;

    if (t.hasAttribute('data-copy')) {
      copyNear(t);
      return;
    }

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
      prefill(t.dataset.service, t.dataset.brief);
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
    let scrolled = null;
    const onScroll = () => {
      const s = window.scrollY > 8;
      if (s !== scrolled) header.classList.toggle('is-scrolled', (scrolled = s));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // Which section sits right under the header bar decides its light/dark variant. An observer
    // watches a 2px strip just below the bar, so nothing is measured while scrolling.
    const dark = new Set();
    let io = null;
    const watch = () => {
      io?.disconnect();
      dark.clear();
      const top = header.offsetHeight;
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => (en.isIntersecting ? dark.add(en.target) : dark.delete(en.target)));
        header.classList.toggle('on-dark', dark.size > 0);
      }, { rootMargin: `-${top}px 0px -${Math.max(0, window.innerHeight - top - 2)}px 0px` });
      document.querySelectorAll('main [data-theme="dark"], main [data-header="dark"], footer[data-theme="dark"]').forEach((el) => io.observe(el));
    };
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(watch, 150);
    }, { passive: true });
    watch();
  }

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}
