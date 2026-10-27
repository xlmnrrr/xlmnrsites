import { h, get } from './content.js';
import { reduceMotion } from './env.js';

const EASE = 'cubic-bezier(.2,.7,.2,1)';

// Data shape: [{ title, items: [{ q, a }] }] — read from the static DOM until content.json arrives.
function readDom() {
  return [...document.querySelectorAll('#faq-body .faq__panel')].map((panel) => ({
    title: document.getElementById(panel.getAttribute('aria-labelledby'))?.textContent.trim() || '',
    items: [...panel.querySelectorAll('.qa')].map((qa) => ({
      q: qa.querySelector('.qa__q').textContent.trim(),
      a: qa.querySelector('.qa__a').textContent.trim(),
    })),
  }));
}

function valid(categories) {
  return Array.isArray(categories) && categories.length > 0 &&
    categories.every((c) => c && typeof c.title === 'string' && Array.isArray(c.items));
}

/* ---------- accordion ---------- */
function animateDetails(details) {
  const body = details.querySelector('.qa__a');
  const opening = !details.open;
  if (details._anim) details._anim.cancel();
  if (opening) details.open = true;
  const from = opening ? 0 : body.offsetHeight;
  const to = opening ? body.scrollHeight : 0;
  const anim = body.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: EASE });
  details._anim = anim;
  anim.onfinish = () => {
    details._anim = null;
    if (!opening) details.open = false;
  };
}

function initAccordion(container) {
  container.addEventListener('click', (e) => {
    const summary = e.target.closest('.qa__q');
    if (!summary || reduceMotion.matches) return;
    e.preventDefault();
    animateDetails(summary.parentElement);
  });
}

/* ---------- tabs ---------- */
function selectTab(tabs, index, focus) {
  tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (panel) panel.hidden = !on;
  });
  if (focus) tabs[index].focus();
}

function initTabs(tablist) {
  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    selectTab(tabs, tabs.indexOf(tab), false);
  });
  tablist.addEventListener('keydown', (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs, (next + tabs.length) % tabs.length, true);
  });
}

export function renderFaq(categories) {
  if (!valid(categories)) return;
  if (JSON.stringify(categories) === JSON.stringify(readDom())) return;
  const tablist = document.getElementById('faq-tabs');
  const body = document.getElementById('faq-body');
  const tabs = categories.map((c, i) => h('button', {
    type: 'button', class: 'tab', role: 'tab', id: `faq-t-${i}`, 'aria-controls': `faq-p-${i}`,
    'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? null : '-1',
  }, c.title));
  const panels = categories.map((c, i) => h('div', {
    class: 'faq__panel', role: 'tabpanel', id: `faq-p-${i}`, 'aria-labelledby': `faq-t-${i}`, hidden: i !== 0,
  }, c.items.map((it) => h('details', { class: 'qa' },
    h('summary', { class: 'qa__q' }, String(it.q || '')),
    h('div', { class: 'qa__a' }, h('p', null, String(it.a || ''))),
  ))));
  tablist.replaceChildren(...tabs);
  body.querySelectorAll('.faq__panel').forEach((p) => p.remove());
  body.append(...panels);
}

/* ---------- FAQ bot: honest scripted answers, not AI ---------- */
function initBot(getData) {
  const dlg = document.getElementById('bot');
  const log = document.getElementById('bot-log');
  const choices = document.getElementById('bot-choices');
  if (!dlg || !log || !choices) return;
  let started = false;
  let pending = null;

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function say(text, who = 'bot') {
    log.append(h('p', { class: `msg msg--${who}` }, text));
    scrollDown();
  }

  function botReply(text, then) {
    clearTimeout(pending);
    choices.replaceChildren();
    if (reduceMotion.matches) {
      say(text);
      then();
      return;
    }
    const typing = h('p', { class: 'msg msg--bot msg--typing', 'aria-label': 'Печатает…' }, h('i'), h('i'), h('i'));
    log.append(typing);
    scrollDown();
    pending = setTimeout(() => {
      typing.remove();
      say(text);
      then();
    }, 520);
  }

  function chip(label, onClick, extra = '') {
    const b = h('button', { type: 'button', class: `chip ${extra}`.trim() }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  function showTopics() {
    const { categories } = getData();
    choices.replaceChildren(...categories.map((c, i) => chip(c.title, () => openTopic(i))));
  }

  function openTopic(i) {
    const cat = getData().categories[i];
    if (!cat) return;
    say(cat.title, 'user');
    botReply('Выберите вопрос:', () => showQuestions(i));
  }

  function showQuestions(i, skip = -1) {
    const cat = getData().categories[i];
    const list = cat.items
      .map((it, j) => (j === skip ? null : chip(it.q, () => answer(i, j))))
      .filter(Boolean);
    choices.replaceChildren(...list, chip('← Другие темы', () => { say('Другие темы', 'user'); botReply('Выберите тему:', showTopics); }, 'chip--back'));
  }

  function answer(i, j) {
    const item = getData().categories[i].items[j];
    say(item.q, 'user');
    botReply(item.a, () => showQuestions(i, j));
  }

  dlg.addEventListener('xl:open', () => {
    if (started) return;
    started = true;
    say(getData().greeting);
    showTopics();
  });
}

export function initFaq(contentPromise) {
  const tablist = document.getElementById('faq-tabs');
  const body = document.getElementById('faq-body');
  if (!tablist || !body) return;
  initTabs(tablist);
  initAccordion(body);

  let data = {
    greeting: 'Здравствуйте! Здесь ответы на частые вопросы. Выберите тему — или сразу оставьте заявку.',
    categories: readDom(),
  };
  contentPromise.then((c) => {
    const cats = get(c, 'faq.categories');
    if (valid(cats)) {
      data.categories = cats;
      renderFaq(cats);
    }
    const greeting = get(c, 'faq.botGreeting');
    if (typeof greeting === 'string' && greeting) data.greeting = greeting;
  });
  initBot(() => data);
}
