import { h, get, safeHref } from './content.js';

const TIMEOUT_MS = 15000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PROFILE = /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru|t\.me)\/[\w.\-]{2,}\/?$/i;
const HANDLE = /^@[\w.]{3,}$/;

const DEFAULTS = {
  phone: '8 (987) 109-84-37',
  phoneLink: 'tel:+79871098437',
  email: 'makar.ulyanov.02@mail.ru',
  emailLink: 'mailto:makar.ulyanov.02@mail.ru',
  success: 'Заявка отправлена. Отвечу в ВК или по телефону.',
  errorTitle: 'Заявка не отправлена.',
  errorText: 'Позвоните или напишите на почту — так будет быстрее:',
  submit: 'Отправить заявку',
};

function contactValid(v) {
  if (EMAIL.test(v) || PROFILE.test(v) || HANDLE.test(v)) return true;
  const digits = v.replace(/\D/g, '');
  return /^[+\d\s\-()]+$/.test(v) && digits.length >= 10 && digits.length <= 15;
}

const RULES = {
  name(v) {
    if (!v) return 'Укажите имя';
    if (v.length < 2) return 'Имя слишком короткое';
    return '';
  },
  contact(v) {
    if (!v) return 'Укажите телефон, email или ссылку на ВК';
    if (!contactValid(v)) return 'Проверьте контакт: телефон (10–15 цифр), email или ссылка vk.com/…';
    return '';
  },
  message(v) {
    return v.length > 2000 ? 'Сократите сообщение до 2000 символов' : '';
  },
  consent(_, input) {
    return input.checked ? '' : 'Нужно согласие на обработку персональных данных';
  },
};

function endpointValid(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

export function initForm(contentPromise) {
  const form = document.getElementById('lead-form');
  if (!form) return;
  const status = document.getElementById('form-status');
  const submit = form.querySelector('.form__submit');
  const label = submit.querySelector('.btn__label');
  const touched = new Set();
  let content = null;
  let busy = false;
  contentPromise.then((d) => { content = d; });

  const text = (key) => get(content, `form.${key}`) || DEFAULTS[key];
  const contact = (key) => get(content, `contacts.${key}`) || DEFAULTS[key];

  function check(name) {
    const input = form.elements[name];
    const value = input.type === 'checkbox' ? '' : input.value.trim();
    const msg = RULES[name](value, input);
    const err = document.getElementById(`f-${name}-err`);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg;
    return !msg;
  }

  function validateAll() {
    let first = null;
    for (const name of Object.keys(RULES)) {
      touched.add(name);
      if (!check(name) && !first) first = form.elements[name];
    }
    if (first) first.focus();
    return !first;
  }

  form.addEventListener('focusout', (e) => {
    const name = e.target.name;
    if (RULES[name] && (e.target.value || touched.has(name))) {
      touched.add(name);
      check(name);
    }
  });
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (RULES[name] && e.target.getAttribute('aria-invalid') === 'true') check(name);
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'consent' && touched.has('consent')) check('consent');
  });

  function setBusy(on) {
    busy = on;
    form.classList.toggle('is-loading', on);
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    submit.disabled = on;
    label.textContent = on ? 'Отправляю…' : text('submit');
  }

  function contactLinks() {
    const links = h('p', { class: 'alert__links' });
    const tel = safeHref(contact('phoneLink'));
    const mail = safeHref(contact('emailLink'));
    if (tel) links.append(h('a', { href: tel }, contact('phone')));
    if (mail) links.append(h('a', { href: mail }, contact('email')));
    return links;
  }

  function showError(reason) {
    const detail = {
      validation: reason.message ? `${reason.message}. Проверьте поля или свяжитесь напрямую:` : 'Проверьте поля или свяжитесь напрямую:',
      rate: 'Слишком много попыток подряд. Попробуйте позже или свяжитесь напрямую:',
    }[reason.kind] || text('errorText');
    status.replaceChildren(
      h('div', { class: 'alert alert--error', role: 'alert' },
        h('p', { class: 'alert__title' }, text('errorTitle')),
        h('p', null, detail),
        contactLinks(),
      ),
    );
  }

  function showSuccess() {
    status.replaceChildren(
      h('div', { class: 'alert alert--success' },
        h('p', { class: 'alert__title' }, text('success')),
      ),
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    status.replaceChildren();
    if (!validateAll()) return;

    const fields = form.elements;
    // Honeypot: bots fill hidden fields — pretend success, send nothing.
    if (fields.website.value.trim()) {
      form.reset();
      showSuccess();
      return;
    }

    const endpoint = String(get(content, 'settings.formEndpoint') || '').trim();
    if (!endpointValid(endpoint)) {
      showError({ kind: 'config' });
      return;
    }

    const payload = {
      name: fields.name.value.trim(),
      contact: fields.contact.value.trim(),
      message: fields.message.value.trim(),
      consent: true,
      ts: Date.now(),
      page: (location.origin + location.pathname + location.search).slice(0, 300),
      website: '',
    };

    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok === true) {
        form.reset();
        touched.clear();
        form.querySelectorAll('[aria-invalid]').forEach((el) => el.setAttribute('aria-invalid', 'false'));
        showSuccess();
        const id = Number(get(content, 'settings.metrikaId'));
        if (typeof window.ym === 'function' && id) window.ym(id, 'reachGoal', 'lead');
      } else if (res.status === 400 || res.status === 422) {
        showError({ kind: 'validation', message: data && typeof data.error === 'string' ? data.error.slice(0, 200) : '' });
      } else if (res.status === 429) {
        showError({ kind: 'rate' });
      } else {
        showError({ kind: 'server' });
      }
    } catch {
      showError({ kind: 'network' });
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  });
}
