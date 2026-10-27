// Re-renders list sections from content.json. Static HTML is the no-JS/SEO snapshot;
// nodes are replaced only when the content actually differs.
import { h, icon, get } from './content.js';
import { observeReveal } from './fx.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : '');
const pad = (i) => String(i + 1).padStart(2, '0');
const SAFE_IMG = /^\/assets\/img\/[\w\-/]+\.(svg|webp|png|jpe?g|avif)$/;

function signature(el) {
  return [
    el.textContent.replace(/\s+/g, ' ').trim(),
    ...[...el.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    ...[...el.querySelectorAll('[data-service]')].map((b) => b.dataset.service),
  ].join('|');
}

function swap(container, nodes) {
  if (!container) return;
  const next = h('div', null, nodes);
  if (signature(next) === signature(container)) return;
  const revealed = container.querySelector('.is-revealed');
  container.replaceChildren(...next.childNodes);
  if (revealed) container.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed', 'is-built'));
  else observeReveal(container);
}

const arrow = () => icon('arrow', 18);

function serviceCard(s, i) {
  return h('article', { class: 'card service', 'data-tilt': true, 'data-reveal': true },
    h('div', { class: 'service__top' }, h('span', { class: 'service__num' }, pad(i)), icon(str(s.icon), 28, 'service__icon')),
    h('h3', { class: 'service__title' }, str(s.title)),
    h('p', { class: 'service__text' }, str(s.text)),
    h('ul', { class: 'service__list' }, arr(s.bullets).map((b) => h('li', null, str(b)))),
    h('dl', { class: 'service__meta' },
      h('div', null, h('dt', null, 'Стоимость'), h('dd', null, str(s.price))),
      h('div', null, h('dt', null, 'Сроки'), h('dd', null, str(s.term)))),
    h('button', { type: 'button', class: 'link-btn', 'data-scroll': 'request', 'data-service': str(s.service) || str(s.title) }, 'Обсудить проект', arrow()),
  );
}

function step(s, i) {
  return h('li', { class: 'step', 'data-reveal': true },
    h('span', { class: 'step__num' }, pad(i)),
    h('h3', { class: 'step__title' }, str(s.title)),
    h('p', { class: 'step__text' }, str(s.text)));
}

function caseCard(c, i, badge) {
  const src = SAFE_IMG.test(str(c.image)) ? c.image : '/assets/img/cases/landing.svg';
  return h('article', { class: 'card case', 'data-tilt': true, 'data-reveal': true },
    h('div', { class: 'case__media' }, h('img', { src, width: 640, height: 440, loading: 'lazy', decoding: 'async', alt: '' })),
    h('span', { class: 'badge' }, badge),
    h('div', { class: 'case__body' },
      h('p', { class: 'case__type' }, str(c.type)),
      h('h3', { class: 'case__title' }, str(c.title)),
      h('p', { class: 'case__text' }, str(c.text)),
      h('button', { type: 'button', class: 'case__more', 'data-case': i, 'data-cursor-label': 'Смотреть', 'aria-haspopup': 'dialog' }, 'Подробнее', arrow())));
}

function advantage(a) {
  return h('li', { class: 'adv', 'data-reveal': true },
    icon('check', 22, 'adv__icon'),
    h('h3', { class: 'adv__title' }, str(a.title)),
    h('p', { class: 'adv__text' }, str(a.text)));
}

export function renderLists(data) {
  if (!data) return;
  const services = arr(get(data, 'services.items'));
  if (services.length) swap(document.getElementById('services-list'), services.map(serviceCard));

  const steps = arr(get(data, 'process.items'));
  if (steps.length) swap(document.getElementById('process-list'), steps.map(step));

  const cases = arr(get(data, 'cases.items'));
  if (cases.length) swap(document.getElementById('cases-list'), cases.map((c, i) => caseCard(c, i, str(get(data, 'cases.badge')) || 'Пример')));

  const adv = arr(get(data, 'advantages.items'));
  if (adv.length) swap(document.getElementById('advantages-list'), adv.map(advantage));

  const numbers = document.getElementById('numbers');
  const items = arr(get(data, 'numbers.items')).filter((n) => str(n.value) && str(n.label));
  if (numbers) {
    const on = get(data, 'numbers.enabled') === true && items.length > 0;
    numbers.hidden = !on;
    if (on) {
      document.getElementById('numbers-list').replaceChildren(...items.map((n) =>
        h('div', { class: 'numbers__item' }, h('dt', null, str(n.label)), h('dd', null, str(n.value)))));
    }
  }
}

// Case details dialog — filled from content.json, falling back to the card itself.
export function initCases(contentPromise, openDialog) {
  const dlg = document.getElementById('case-dialog');
  if (!dlg) return;
  let data = null;
  contentPromise.then((d) => { data = d; });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-case]');
    if (!btn) return;
    const i = Number(btn.dataset.case);
    const card = btn.closest('.case');
    const c = arr(get(data, 'cases.items'))[i] || {
      type: card.querySelector('.case__type')?.textContent,
      title: card.querySelector('.case__title')?.textContent,
      text: card.querySelector('.case__text')?.textContent,
      image: card.querySelector('img')?.getAttribute('src'),
      details: [],
    };
    document.getElementById('case-dialog-type').textContent = str(c.type);
    document.getElementById('case-dialog-title').textContent = str(c.title);
    document.getElementById('case-dialog-text').textContent = str(c.text);
    document.getElementById('case-dialog-img').setAttribute('src', SAFE_IMG.test(str(c.image)) ? c.image : '/assets/img/cases/landing.svg');
    const list = document.getElementById('case-dialog-list');
    list.replaceChildren(...arr(c.details).map((d) => h('li', null, str(d))));
    list.hidden = list.children.length === 0;
    document.getElementById('case-dialog-cta').dataset.service = str(c.service) || str(c.type);
    openDialog(dlg, btn);
  });
}
