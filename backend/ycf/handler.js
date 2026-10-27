'use strict';

// Yandex Cloud Function (Node.js 20): receives the lead form as JSON and forwards it
// to VK (messages.send, x-www-form-urlencoded). Optional SMTP e-mail fallback.
// No npm dependencies: global fetch + node:tls + node:crypto.

const tls = require('node:tls');
const crypto = require('node:crypto');

const VK_ENDPOINT = 'https://api.vk.com/method/messages.send';
const DEFAULT_ORIGINS = 'https://xlmnr.ru https://xlmnrrr.github.io http://localhost:8000';
const DEFAULT_VK_VERSION = '5.199';
const MAX_BODY = 10 * 1024;
const LIMITS = { name: [2, 80], contact: [3, 120], message: [0, 2000], page: [0, 300] };
const RATE = { windowMs: 10 * 60 * 1000, max: 5 };
const hits = new Map();

const env = (k, d = '') => (process.env[k] || d).trim();

function allowedOrigins() {
  return env('ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(/[\s,;]+/).filter(Boolean);
}

function header(headers, name) {
  if (!headers) return '';
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

function reply(status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
    headers.Vary = 'Origin';
  }
  return { statusCode: status, headers, body: body === null ? '' : JSON.stringify(body), isBase64Encoded: false };
}

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE.max;
}

const clean = (v) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Некорректный формат заявки' };
  const lead = {
    name: clean(input.name),
    contact: clean(input.contact),
    message: clean(input.message),
    page: clean(input.page),
    ts: Number(input.ts) || Date.now(),
  };
  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    if (lead[k].length < min) return { error: k === 'name' ? 'Укажите имя' : k === 'contact' ? 'Укажите контакт для связи' : `Поле ${k} слишком короткое` };
    if (lead[k].length > max) return { error: `Поле ${k} слишком длинное` };
  }
  if (input.consent !== true) return { error: 'Требуется согласие на обработку персональных данных' };
  return { lead };
}

function formatLead(lead) {
  const when = new Date(lead.ts).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
  return [
    'Новая заявка с сайта xlmnr.ru',
    `Имя: ${lead.name}`,
    `Контакт: ${lead.contact}`,
    lead.message ? `Сообщение: ${lead.message}` : 'Сообщение: —',
    lead.page ? `Страница: ${lead.page}` : null,
    `Время (Уфа): ${when}`,
  ].filter(Boolean).join('\n');
}

/* ---------- VK ---------- */
async function sendVk(text) {
  const token = env('VK_TOKEN');
  const peerId = env('VK_PEER_ID');
  if (!token) throw Object.assign(new Error('VK token missing'), { config: true });
  if (!peerId) throw Object.assign(new Error('VK peer_id missing'), { config: true });

  // VK API accepts only application/x-www-form-urlencoded (or query string), never JSON.
  const params = new URLSearchParams({
    access_token: token,
    peer_id: peerId,
    message: text,
    random_id: String(crypto.randomInt(1, 2147483647)),
    dont_parse_links: '1',
    disable_mentions: '1',
    v: env('VK_API_VERSION', DEFAULT_VK_VERSION),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let data;
  try {
    const res = await fetch(VK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: ctrl.signal,
    });
    data = await res.json();
  } catch (err) {
    throw new Error(`VK API error: network ${err.name === 'AbortError' ? 'timeout' : err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (data && data.error) throw new Error(`VK API error: ${data.error.error_code} ${data.error.error_msg}`);
  if (!data || data.response === undefined) throw new Error('VK API error: empty response');
  return data.response;
}

/* ---------- SMTP fallback (implicit TLS, AUTH LOGIN) ---------- */
function smtpConfig() {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(env('SMTP_PORT', '465')),
    user,
    pass,
    from: env('SMTP_FROM', user),
    to: env('SMTP_TO', 'makar.ulyanov.02@mail.ru'),
  };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function sendMail(cfg, subject, text) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, minVersion: 'TLSv1.2' });
    socket.setEncoding('utf8');
    socket.setTimeout(10000, () => socket.destroy(new Error('SMTP timeout')));
    let buffer = '';
    let waiter = null;
    const fail = (err) => { socket.destroy(); reject(err); };
    socket.on('error', fail);
    // A reply is complete when its last line is "NNN <text>" (multi-line replies use "NNN-").
    const drain = () => {
      const lines = buffer.split('\r\n');
      const last = lines.length > 1 ? lines[lines.length - 2] : '';
      if (waiter && /^\d{3} /.test(last)) {
        const r = buffer;
        buffer = '';
        const w = waiter;
        waiter = null;
        w(r);
      }
    };
    socket.on('data', (chunk) => { buffer += chunk; drain(); });
    const expect = (code) => new Promise((res, rej) => {
      waiter = (r) => (r.startsWith(String(code)) ? res(r) : rej(new Error(`SMTP ${r.trim().split('\r\n').pop()}`)));
      drain();
    });
    const cmd = (line, code) => { const p = expect(code); socket.write(`${line}\r\n`); return p; };

    const body = b64(text).replace(/.{1,76}/g, '$&\r\n');
    const message = [
      `From: XLMNR <${cfg.from}>`,
      `To: <${cfg.to}>`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@xlmnr.ru>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      body,
    ].join('\r\n');

    (async () => {
      await expect(220);
      await cmd('EHLO xlmnr.ru', 250);
      await cmd('AUTH LOGIN', 334);
      await cmd(b64(cfg.user), 334);
      await cmd(b64(cfg.pass), 235);
      await cmd(`MAIL FROM:<${cfg.from}>`, 250);
      await cmd(`RCPT TO:<${cfg.to}>`, 250);
      await cmd('DATA', 354);
      await cmd(`${message}\r\n.`, 250);
      socket.end('QUIT\r\n');
      resolve();
    })().catch(fail);
  });
}

/* ---------- handler ---------- */
module.exports.handler = async (event) => {
  const method = String(event.httpMethod || '').toUpperCase();
  const origin = header(event.headers, 'origin');
  const allowed = allowedOrigins().includes(origin) ? origin : '';

  if (method === 'OPTIONS') {
    return allowed ? reply(204, null, allowed) : reply(403, { ok: false, error: 'Origin not allowed' }, '');
  }
  if (!allowed) return reply(403, { ok: false, error: 'Origin not allowed' }, '');
  if (method !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' }, allowed);
  if (!/application\/json/i.test(header(event.headers, 'content-type'))) {
    return reply(415, { ok: false, error: 'Ожидается application/json' }, allowed);
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return reply(413, { ok: false, error: 'Слишком большой запрос' }, allowed);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'Некорректный JSON' }, allowed);
  }

  // Honeypot: answer like a success so bots learn nothing.
  if (input && typeof input.website === 'string' && input.website.trim()) {
    return reply(200, { ok: true }, allowed);
  }

  const { lead, error } = validate(input);
  if (error) return reply(400, { ok: false, error }, allowed);

  const ip = event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp;
  if (rateLimited(ip)) return reply(429, { ok: false, error: 'Слишком много заявок, попробуйте позже' }, allowed);

  const text = formatLead(lead);
  let vkError = null;
  try {
    await sendVk(text);
    return reply(200, { ok: true }, allowed);
  } catch (err) {
    vkError = err;
    console.error(JSON.stringify({ level: 'error', msg: err.message }));
  }

  const smtp = smtpConfig();
  if (smtp) {
    try {
      await sendMail(smtp, 'Новая заявка с сайта xlmnr.ru', text);
      console.warn(JSON.stringify({ level: 'warn', msg: 'delivered via email fallback', vk: vkError.message }));
      return reply(200, { ok: true, channel: 'email' }, allowed);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: `SMTP fallback failed: ${err.message}` }));
    }
  }

  // Nothing delivered: keep the lead in the function log so it is not lost.
  console.error(JSON.stringify({ level: 'error', msg: 'lead not delivered', lead: text }));
  if (vkError.config) return reply(503, { ok: false, error: vkError.message }, allowed);
  return reply(502, { ok: false, error: vkError.message }, allowed);
};

// Exposed for local tests only.
module.exports._internal = { validate, formatLead, sendVk, allowedOrigins };
