import { get } from './content.js';
import { emitUi } from './env.js';

// Cookie choice is the only thing stored locally. Analytics loads strictly after "accept".
const KEY = 'xlmnr-consent-v1';
let metrikaLoaded = false;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.analytics === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

function write(analytics) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics, ts: Date.now() }));
  } catch { /* storage blocked: choice lives for this page view only */ }
}

function loadMetrika(id) {
  if (metrikaLoaded || !/^\d{5,12}$/.test(id)) return;
  metrikaLoaded = true;
  const ym = function () { (ym.a = ym.a || []).push(arguments); };
  ym.l = Date.now();
  window.ym = window.ym || ym;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.append(s);
  window.ym(Number(id), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
}

function dropMetrikaCookies() {
  document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('_ym')).forEach((n) => {
    document.cookie = `${n}=; Max-Age=0; path=/`;
    document.cookie = `${n}=; Max-Age=0; path=/; domain=.${location.hostname}`;
  });
}

export function initConsent(contentPromise) {
  const banner = document.getElementById('cookie');
  const dlg = document.getElementById('cookie-settings');
  const toggle = document.getElementById('cookie-analytics');
  const root = document.documentElement;
  let metrikaId = '';
  const ready = contentPromise.then((c) => { metrikaId = String(get(c, 'settings.metrikaId') || '').trim(); });

  const saved = read();
  if (!saved) {
    if (banner) banner.hidden = false;
    root.classList.add('cookie-pending');
  } else if (saved.analytics) {
    ready.then(() => loadMetrika(metrikaId));
  }

  function save(analytics) {
    const before = read();
    write(analytics);
    if (banner) banner.hidden = true;
    root.classList.remove('cookie-pending');
    emitUi();
    if (analytics) {
      ready.then(() => loadMetrika(metrikaId));
    } else if (before && before.analytics) {
      dropMetrikaCookies();
      if (metrikaLoaded) location.reload();
    }
  }

  banner?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cookie]');
    if (btn) save(btn.dataset.cookie === 'all');
  });

  if (dlg && toggle) {
    dlg.addEventListener('xl:open', () => {
      toggle.checked = Boolean(read()?.analytics);
      dlg.returnValue = '';
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'save') save(toggle.checked);
    });
  }
}
