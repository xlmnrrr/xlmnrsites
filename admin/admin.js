// Content editor: reads/writes data/content.json through the GitHub Contents API.
// The PAT lives only in this browser (localStorage or sessionStorage) and is sent only to api.github.com.
import { h } from '/assets/js/content.js';

const REPO = 'xlmnrrr/xlmnrsites';
const PATH = 'data/content.json';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN_KEY = 'xlmnr-admin-pat';

const LABELS = {
  settings: 'Настройки', formEndpoint: 'URL приёма заявок (Yandex Cloud Function)', metrikaId: 'ID счётчика Яндекс.Метрики',
  contacts: 'Контакты', phone: 'Телефон (как показывать)', phoneLink: 'Ссылка на телефон', email: 'Email', emailLink: 'Ссылка на email',
  city: 'Город', replyNote: 'Как отвечаю', requisites: 'Реквизиты', status: 'Статус', fullName: 'ФИО полностью', shortName: 'Кратко',
  inn: 'ИНН', ogrnip: 'ОГРНИП', address: 'Адрес', docsDate: 'Дата редакции документов',
  hero: 'Первый экран', eyebrow: 'Надзаголовок', title: 'Заголовок', subtitle: 'Подзаголовок', ctaPrimary: 'Главная кнопка',
  ctaSecondary: 'Вторая кнопка', note: 'Примечание', services: 'Услуги', kicker: 'Метка раздела', lead: 'Вводный текст',
  items: 'Элементы', icon: 'Иконка (landing / corporate / refine / support)', text: 'Текст', bullets: 'Пункты', price: 'Стоимость',
  term: 'Сроки', service: 'Название услуги для заявки', process: 'Как работаю', cases: 'Кейсы', badge: 'Плашка',
  image: 'Картинка (путь /assets/img/…)', type: 'Тип', details: 'Что входит', advantages: 'Преимущества', numbers: 'Цифры',
  enabled: 'Показывать блок', value: 'Значение', label: 'Подпись', form: 'Форма заявки', submit: 'Текст кнопки',
  success: 'Сообщение об успехе', errorTitle: 'Заголовок ошибки', errorText: 'Текст ошибки', faq: 'Вопросы и ответы',
  botGreeting: 'Приветствие помощника', botNote: 'Пометка помощника', categories: 'Темы', q: 'Вопрос', a: 'Ответ',
  contactsSection: 'Раздел «Контакты»', write: 'Кнопка «Написать»', footer: 'Подвал', tagline: 'Слоган', version: 'Версия схемы',
};
const HINTS = {
  'settings.formEndpoint': 'Пусто — форма честно покажет ошибку и телефон. Пример: https://functions.yandexcloud.net/d4e…',
  'settings.metrikaId': 'Только цифры. Пусто — аналитика не подключается.',
  'requisites.inn': '12 цифр для физлица.',
  'numbers.enabled': 'Включайте только с реальными данными.',
};
const LONG = new Set(['text', 'lead', 'subtitle', 'note', 'a', 'botGreeting', 'success', 'errorText', 'title']);
const SECRET = /(vk1\.a\.|ghp_[A-Za-z0-9]{20,}|github_pat_|-----BEGIN|y0_[A-Za-z0-9_-]{20,}|AQVN[A-Za-z0-9_-]{20,})/;
const SAFE_IMG = /^\/assets\/img\/[\w\-/]+\.(svg|webp|png|jpe?g|avif)$/;

const $ = (id) => document.getElementById(id);
const state = { token: '', data: null, sha: '', dirty: false, tab: '' };

/* ---------- token storage ---------- */
function loadToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function storeToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* storage blocked: token lives in memory only */ }
}
function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  state.token = '';
  $('token').value = '';
  status('Токен удалён из этого браузера.', 'ok');
}

/* ---------- UI helpers ---------- */
function status(msg, kind = '') {
  const el = $('status');
  el.className = `admin-status${kind ? ` is-${kind}` : ''}`;
  el.textContent = msg;
}
function setDirty(on) {
  state.dirty = on;
  $('dirty').hidden = !on;
}

/* ---------- base64 (UTF-8 safe) ---------- */
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------- GitHub API ---------- */
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gh(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Нет связи с api.github.com. Проверьте интернет и повторите.');
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  const human = {
    401: 'Токен истёк или неверный. Создайте новый fine-grained PAT и вставьте его заново.',
    403: res.headers.get('x-ratelimit-remaining') === '0'
      ? 'Превышен лимит запросов GitHub. Подождите и повторите.'
      : 'Токен неверный или у него нет прав: нужен доступ к xlmnrrr/xlmnrsites с Contents: Read and write.',
    404: 'Файл или репозиторий не найден, либо у токена нет доступа к репозиторию.',
    409: 'Файл изменился на GitHub после загрузки. Нажмите «Загрузить заново» и повторите правки.',
    422: 'GitHub отклонил сохранение (версия файла устарела). Нажмите «Загрузить заново».',
  }[res.status] || `Ошибка GitHub ${res.status}: ${body.message || 'неизвестная ошибка'}`;
  throw new ApiError(res.status, human);
}

async function load() {
  status('Загружаю content.json…');
  const file = await gh(`/contents/${PATH}?ref=${BRANCH}`);
  state.data = JSON.parse(b64decode(file.content));
  state.sha = file.sha;
  setDirty(false);
  $('editor-panel').hidden = false;
  renderTabs();
  status(`Загружено. Версия файла ${file.sha.slice(0, 7)}.`, 'ok');
}

/* ---------- validation ---------- */
function validate(data) {
  const errors = [];
  for (const key of ['settings', 'contacts', 'requisites', 'hero', 'services', 'faq']) {
    if (!data || typeof data[key] !== 'object') errors.push(`Нет раздела «${LABELS[key] || key}».`);
  }
  if (errors.length) return errors;
  const ep = String(data.settings.formEndpoint || '').trim();
  if (ep && !/^https:\/\/[^\s"<>]+$/.test(ep)) errors.push('URL приёма заявок должен начинаться с https://');
  const ym = String(data.settings.metrikaId || '').trim();
  if (ym && !/^\d{5,12}$/.test(ym)) errors.push('ID Метрики — только цифры (5–12).');
  if (!/^tel:\+?[\d\-()\s]+$/.test(data.contacts.phoneLink || '')) errors.push('Ссылка на телефон должна быть вида tel:+79871098437.');
  if (!/^mailto:[^\s<>"]+$/.test(data.contacts.emailLink || '')) errors.push('Ссылка на email должна быть вида mailto:адрес.');
  (data.cases?.items || []).forEach((c, i) => {
    if (c.image && !SAFE_IMG.test(c.image)) errors.push(`Кейс ${i + 1}: картинка должна лежать в /assets/img/…`);
  });
  const json = JSON.stringify(data);
  if (SECRET.test(json)) errors.push('Похоже, в тексте есть токен или ключ. Секреты нельзя хранить в content.json — он публичный.');
  return errors;
}

async function save() {
  const errors = validate(state.data);
  if (errors.length) {
    status(errors.join(' '), 'error');
    return;
  }
  const btn = $('save');
  btn.disabled = true;
  status('Сохраняю…');
  try {
    const body = JSON.stringify({
      message: 'content: update via admin',
      content: b64encode(`${JSON.stringify(state.data, null, 2)}\n`),
      sha: state.sha,
      branch: BRANCH,
    });
    const res = await gh(`/contents/${PATH}`, { method: 'PUT', body });
    state.sha = res.content.sha;
    setDirty(false);
    status(`Сохранено (коммит ${res.commit.sha.slice(0, 7)}). Сайт обновится через 1–2 минуты после сборки GitHub Pages.`, 'ok');
  } catch (err) {
    status(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- form generator ---------- */
function getAt(path) { return path.reduce((o, k) => o[k], state.data); }
function setAt(path, value) {
  const parent = getAt(path.slice(0, -1));
  parent[path[path.length - 1]] = value;
  setDirty(true);
}
const keyOf = (path) => path.filter((p) => typeof p === 'string').join('.');

function blank(sample) {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, blank(v)]));
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  return '';
}

function field(label, path, value) {
  const key = path[path.length - 1];
  const id = `f-${path.join('-')}`;
  const wrap = h('div', { class: 'field' });
  const lab = h('label', { class: 'field__label', for: id }, label);
  let input;
  if (typeof value === 'boolean') {
    input = h('input', { id, type: 'checkbox', class: 'switch' });
    input.checked = value;
    input.addEventListener('change', () => setAt(path, input.checked));
    wrap.append(h('div', { class: 'admin-check' }, input, lab));
  } else {
    const long = LONG.has(key) || String(value).length > 70;
    input = h(long ? 'textarea' : 'input', { id, class: 'field__input', spellcheck: 'true', ...(long ? { rows: 3 } : { type: typeof value === 'number' ? 'number' : 'text' }) });
    input.value = String(value);
    input.addEventListener('input', () => setAt(path, typeof value === 'number' ? Number(input.value) : input.value));
    wrap.append(lab, input);
  }
  const hint = HINTS[keyOf(path)];
  if (hint) wrap.append(h('p', { class: 'node__hint' }, hint));
  return wrap;
}

function node(value, path, label) {
  if (Array.isArray(value)) return list(value, path, label);
  if (value && typeof value === 'object') {
    const box = h('fieldset', { class: path.length === 1 ? 'node node--root' : 'node' });
    if (path.length > 1) box.append(h('legend', null, label));
    for (const [k, v] of Object.entries(value)) box.append(node(v, [...path, k], LABELS[k] || k));
    return box;
  }
  return field(label, path, value);
}

function list(arr, path, label) {
  const box = h('fieldset', { class: 'node' }, h('legend', null, `${label} (${arr.length})`));
  arr.forEach((item, i) => {
    const tools = h('div', { class: 'item__tools' });
    const btn = (text, title, fn, extra = '') => {
      const b = h('button', { type: 'button', class: `mini ${extra}`.trim(), title, 'aria-label': title }, text);
      b.addEventListener('click', fn);
      tools.append(b);
    };
    const rerender = () => { setDirty(true); renderSection(); };
    btn('↑', 'Выше', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; rerender(); } });
    btn('↓', 'Ниже', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; rerender(); } });
    btn('✕', 'Удалить', () => { if (confirm('Удалить элемент?')) { arr.splice(i, 1); rerender(); } }, 'mini--danger');
    const isScalar = typeof item !== 'object' || item === null;
    const body = isScalar ? field(`${i + 1}`, [...path, i], item) : node(item, [...path, i], `${i + 1}`);
    if (!isScalar) body.classList.add('node--root');
    box.append(h('div', { class: 'item' }, h('div', { class: 'item__head' }, h('span', { class: 'item__title' }, `№ ${i + 1}`), tools), body));
  });
  const add = h('button', { type: 'button', class: 'mini mini--add' }, '+ Добавить');
  add.addEventListener('click', () => {
    arr.push(arr.length ? blank(arr[arr.length - 1]) : '');
    setDirty(true);
    renderSection();
  });
  box.append(add);
  return box;
}

function renderSection() {
  const form = $('form');
  const raw = $('raw');
  if (state.tab === '__raw') {
    form.hidden = true;
    raw.hidden = false;
    $('raw-text').value = JSON.stringify(state.data, null, 2);
    return;
  }
  raw.hidden = true;
  form.hidden = false;
  form.replaceChildren(node(state.data[state.tab], [state.tab], LABELS[state.tab] || state.tab));
}

function renderTabs() {
  const tabs = $('tabs');
  const keys = [...Object.keys(state.data).filter((k) => typeof state.data[k] === 'object'), '__raw'];
  if (!keys.includes(state.tab)) state.tab = keys[0];
  tabs.replaceChildren(...keys.map((k) => {
    const b = h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': k === state.tab ? 'true' : 'false' }, k === '__raw' ? 'JSON' : (LABELS[k] || k));
    b.addEventListener('click', () => { state.tab = k; renderTabs(); });
    return b;
  }));
  renderSection();
}

/* ---------- wiring ---------- */
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('token').value.trim() || state.token;
  if (!token) { status('Вставьте токен.', 'error'); return; }
  state.token = token;
  try {
    const repo = await gh('');
    if (!repo.permissions || !repo.permissions.push) {
      status('Токен работает, но без права записи. Нужен Contents: Read and write для xlmnrrr/xlmnrsites.', 'error');
      return;
    }
    storeToken(token, $('remember').checked);
    $('token').value = '';
    $('token').placeholder = 'Токен сохранён';
    await load();
  } catch (err) {
    status(err.message, 'error');
  }
});
$('forget').addEventListener('click', forgetToken);
$('reload').addEventListener('click', () => {
  if (state.dirty && !confirm('Несохранённые изменения пропадут. Продолжить?')) return;
  load().catch((err) => status(err.message, 'error'));
});
$('save').addEventListener('click', save);
$('download').addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(state.data, null, 2)}\n`], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'content.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('raw-apply').addEventListener('click', () => {
  try {
    const next = JSON.parse($('raw-text').value);
    const errors = validate(next);
    if (errors.length) { status(errors.join(' '), 'error'); return; }
    state.data = next;
    setDirty(true);
    status('JSON применён. Не забудьте сохранить.', 'ok');
  } catch (err) {
    status(`Ошибка в JSON: ${err.message}`, 'error');
  }
});
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

state.token = loadToken();
if (state.token) {
  $('token').placeholder = 'Токен сохранён';
  gh('').then(load).catch((err) => status(err.message, 'error'));
}
