'use strict';
// Offline checks of handler.js with a mocked fetch: CORS, validation, honeypot and —
// most importantly — that VK receives application/x-www-form-urlencoded, not JSON.
// Run: node test-local.js   (does NOT contact VK; real delivery must be checked with curl)

const assert = require('node:assert/strict');

const calls = [];
let vkReply = { response: 1 };
global.fetch = async (url, init) => {
  calls.push({ url, init });
  return { json: async () => vkReply };
};

process.env.VK_TOKEN = 'test-token';
process.env.VK_PEER_ID = '2000000001';
delete process.env.VK_API_VERSION;
delete process.env.ALLOWED_ORIGINS;
delete process.env.SMTP_HOST;

const { handler } = require('./handler.js');

let ipSeq = 0;
const ev = (over = {}) => ({
  httpMethod: 'POST',
  headers: { Origin: 'https://xlmnr.ru', 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Анна', contact: '+7 987 000-00-00', message: 'Нужен лендинг', consent: true, ts: Date.now(), page: 'https://xlmnr.ru/', website: '' }),
  isBase64Encoded: false,
  requestContext: { identity: { sourceIp: `10.0.0.${++ipSeq}` } },
  ...over,
});
const json = (r) => JSON.parse(r.body || '{}');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('OPTIONS from allowed origin → 204 + CORS headers', async () => {
  const r = await handler(ev({ httpMethod: 'OPTIONS', body: '' }));
  assert.equal(r.statusCode, 204);
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://xlmnr.ru');
  assert.equal(r.headers['Access-Control-Allow-Headers'], 'Content-Type');
  assert.match(r.headers['Access-Control-Allow-Methods'], /POST/);
});

test('OPTIONS from localhost:8000 allowed', async () => {
  const r = await handler(ev({ httpMethod: 'OPTIONS', headers: { origin: 'http://localhost:8000' } }));
  assert.equal(r.statusCode, 204);
});

test('foreign origin → 403 without CORS headers', async () => {
  const r = await handler(ev({ headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } }));
  assert.equal(r.statusCode, 403);
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});

test('valid lead → VK gets form-urlencoded with random_id and v', async () => {
  calls.length = 0;
  const r = await handler(ev());
  assert.equal(r.statusCode, 200);
  assert.deepEqual(json(r), { ok: true });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.vk.com/method/messages.send');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(typeof init.body, 'string');
  assert.throws(() => JSON.parse(init.body), 'body must not be JSON');
  const p = new URLSearchParams(init.body);
  assert.equal(p.get('access_token'), 'test-token');
  assert.equal(p.get('peer_id'), '2000000001');
  assert.equal(p.get('v'), '5.199');
  const rid = Number(p.get('random_id'));
  assert.ok(Number.isInteger(rid) && rid > 0 && rid < 2 ** 31, 'random_id is int32');
  assert.match(p.get('message'), /Имя: Анна/);
  assert.match(p.get('message'), /Контакт: \+7 987 000-00-00/);
});

test('random_id differs between requests', async () => {
  calls.length = 0;
  await handler(ev());
  await handler(ev());
  const [a, b] = calls.map((c) => new URLSearchParams(c.init.body).get('random_id'));
  assert.notEqual(a, b);
});

test('consent missing → 400', async () => {
  const r = await handler(ev({ body: JSON.stringify({ name: 'Анна', contact: 'a@b.ru', consent: false }) }));
  assert.equal(r.statusCode, 400);
  assert.match(json(r).error, /согласие/);
});

test('honeypot filled → 200 and nothing sent', async () => {
  calls.length = 0;
  const r = await handler(ev({ body: JSON.stringify({ name: 'Bot', contact: 'x@y.z', consent: true, website: 'http://spam' }) }));
  assert.equal(r.statusCode, 200);
  assert.equal(calls.length, 0);
});

test('wrong content type → 415', async () => {
  const r = await handler(ev({ headers: { Origin: 'https://xlmnr.ru', 'Content-Type': 'text/plain' } }));
  assert.equal(r.statusCode, 415);
});

test('broken JSON → 400', async () => {
  const r = await handler(ev({ body: '{oops' }));
  assert.equal(r.statusCode, 400);
});

test('base64 body is decoded', async () => {
  const body = Buffer.from(JSON.stringify({ name: 'Анна', contact: 'a@b.ru', consent: true })).toString('base64');
  const r = await handler(ev({ body, isBase64Encoded: true }));
  assert.equal(r.statusCode, 200);
});

test('VK_TOKEN missing → 503 "VK token missing"', async () => {
  const saved = process.env.VK_TOKEN;
  delete process.env.VK_TOKEN;
  const r = await handler(ev());
  process.env.VK_TOKEN = saved;
  assert.equal(r.statusCode, 503);
  assert.equal(json(r).error, 'VK token missing');
});

test('VK_PEER_ID missing → 503 "VK peer_id missing"', async () => {
  const saved = process.env.VK_PEER_ID;
  delete process.env.VK_PEER_ID;
  const r = await handler(ev());
  process.env.VK_PEER_ID = saved;
  assert.equal(r.statusCode, 503);
  assert.equal(json(r).error, 'VK peer_id missing');
});

test('VK API error → 502 with code and message', async () => {
  vkReply = { error: { error_code: 5, error_msg: 'User authorization failed' } };
  const r = await handler(ev());
  vkReply = { response: 1 };
  assert.equal(r.statusCode, 502);
  assert.equal(json(r).error, 'VK API error: 5 User authorization failed');
});

test('rate limit: 6th request from one IP → 429', async () => {
  const same = { requestContext: { identity: { sourceIp: '192.0.2.77' } } };
  let last;
  for (let i = 0; i < 6; i++) last = await handler(ev(same));
  assert.equal(last.statusCode, 429);
});

(async () => {
  const origError = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      process.stdout.write(`ok   ${name}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`FAIL ${name}\n     ${err.message}\n`);
    }
  }
  console.error = origError;
  console.warn = origWarn;
  process.stdout.write(`\n${tests.length - failed}/${tests.length} passed\n`);
  process.exit(failed ? 1 : 0);
})();
