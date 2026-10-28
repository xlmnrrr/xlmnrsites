// Site assistant: a guided chat over the site's knowledge base (content.json — prices, terms,
// process, cases, contacts and the FAQ). Questions come from contextual chips, a topic sheet with
// search, or a short «pick a format» quiz; typed questions go through a local intent matcher
// (Russian stemming, synonyms, typo tolerance, dialogue context).
// Everything the visitor types stays in the browser and is rendered with textContent only.
import { get, h, safeHref, icon } from './content.js';
import { reduceMotion, finePointer } from './env.js';

/* ---------- text processing ---------- */
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const ENDINGS = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ий|ый|ой|ая|яя|ое|ее|ые|ие|ую|юю|ом|ам|ям|ть|ешь|ете|ет|ут|ют|ем|им|ит|ат|ят|ся|сь|а|я|о|е|ы|и|у|ю|ь)$/;
const stem = (w) => (w.length > 4 ? w.replace(ENDINGS, '') : w);
const STOP = new Set(['как', 'что', 'это', 'для', 'или', 'мне', 'вас', 'ваш', 'ваши', 'если', 'можн', 'нужн', 'есть', 'ли', 'на', 'в', 'и', 'а', 'у', 'по', 'за', 'от', 'до', 'не', 'же', 'бы', 'то', 'так', 'сайт', 'сайта', 'сайты', 'сайтов', 'вы', 'я', 'мы', 'с', 'о', 'об', 'при', 'про', 'ну', 'вот']);

function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function analyse(text) {
  const n = norm(text);
  const words = n.split(' ').filter(Boolean);
  const toks = new Set();
  for (const w of words) {
    if (!STOP.has(w)) toks.add(w);
    const st = stem(w);
    if (!STOP.has(st)) toks.add(st);
  }
  return { n, words, stems: [...toks] };
}

// One typo allowed on the key-length prefix of longer words («стоимасть», «лендиг»).
const fuzzy = (t, key) => key.length >= 6 && t.length >= key.length - 1 &&
  (lev1(t.slice(0, key.length), key) || lev1(t.slice(0, key.length + 1), key) || lev1(t.slice(0, key.length - 1), key));

// key with spaces → phrase inside the text; otherwise a word prefix (raw word or its stem).
function hits(q, key) {
  if (key.includes(' ')) return ` ${q.n} `.includes(key);
  return q.stems.some((t) => t.startsWith(key) || fuzzy(t, key));
}

const score = (q, keys) => keys.reduce((sum, [k, w]) => sum + (hits(q, k) ? w : 0), 0);
const kw = (list, w = 1) => list.map((k) => [k, w]);

/* ---------- knowledge ---------- */
const SERVICE_KEYS = {
  landing: kw(['лендинг', 'landing', 'одностранич', 'посадочн', 'промо']),
  corporate: kw(['корпоратив', 'многостранич', 'компани', 'визитк', 'фирм', 'организац']),
  refine: kw(['доработ', 'передел', 'исправ', 'редизайн', 'ускор', 'починит', 'существующ', 'старый сайт', 'уже есть сайт']),
  support: kw(['поддерж', 'сопровожд', 'обслуживан', 'администрир', 'обновлени']),
};

const INTENTS = {
  greet: kw(['привет', 'здравств', 'здраст', 'добр', 'хай', 'hello', 'салам', 'приветству']),
  thanks: kw(['спасиб', 'благодар', 'thanks', 'понятн', 'ясно', 'спс']),
  bye: kw([' пока ', 'до свидан', 'всего добр']),
  who: kw(['кто ты', 'ты бот', 'вы бот', 'это бот', 'робот', 'нейросет', 'искусствен', 'gpt', 'чатгпт', 'живой', 'человек', 'кто отвечает', 'с кем']),
  price: [...kw(['стои', 'цен', 'прайс', 'бюджет', 'сколько стоит', 'дорог', 'дешев', 'рубл', 'деньг', 'смет', 'расцен']), ['скольк', 0.5]],
  timing: kw(['срок', 'долго', 'быстро сделает', 'врем', 'недел', 'дней', 'месяц', 'когда будет', 'как скоро', 'успеет', 'дедлайн', 'за сколько']),
  services: kw(['услуг', 'что делает', 'чем занима', 'какие сайт', 'что умеет', 'делаете ли', 'направлени', 'что предлага']),
  process: kw(['этап', 'процесс', 'как работает', 'как вы работаете', 'с чего нач', 'как проходит', 'шаг', 'поряд', 'схема работ', 'как всё будет']),
  payment: [['оплат', 1.5], ['договор', 1.3], ...kw(['предоплат', 'аванс', 'чек', 'самозанят', 'налог', 'счет', 'безнал', 'картой', 'рассрочк', 'нпд', 'оферт', 'платит'])],
  examples: [['работ', 0.6], ...kw(['пример', 'портфолио', 'кейс', 'показ', 'покаж', 'посмотр', 'ваши сайт', 'что уже делал', 'демо'])],
  contacts: kw(['телефон', 'позвон', 'звонок', 'почт', 'email', 'адрес', 'где наход', 'вконтакт', 'контакт', 'номер', 'написать вам', 'как с вами', ' вк ', 'связ']),
  order: kw(['заказ', 'заявк', 'хочу сайт', 'нужен сайт', 'нужно сделать', 'оформ', 'начать работ', 'сделайте', 'сделать сайт', 'хочу такой', 'купить', 'хотим сайт', 'нужен лендинг']),
  hosting: kw(['домен', 'хостинг', 'ssl', 'сервер', 'размест', 'https', 'опубликова', 'выложит']),
  revisions: kw(['правк', 'изменени', 'переделк', 'не понрав', 'исправлени', 'итераци']),
  content: kw(['текст', 'фото', 'контент', 'материал', 'копирайт', 'картинк', 'изображени', 'наполнени']),
  mobile: [...kw(['адаптив', 'мобильн', 'смартфон', 'планшет', 'айфон', 'андроид']), ...kw(['на телефоне', 'с телефона', 'на смартфоне'], 1.6)],
  seo: kw(['seo', 'сео', 'продвиж', 'поисков', 'яндекс', 'google', 'гугл', 'индекс', 'реклам', 'трафик', 'директ', 'топ']),
  rights: kw(['права', 'право', 'владел', 'исходник', 'код передад', 'собственн', 'чей сайт', 'кому принадлеж', 'доступы']),
  guarantee: kw(['гарант', 'ответственн', 'если сломается', 'баг', 'ошибк после']),
  remote: kw(['удален', 'другом город', 'не из уф', 'москв', 'регион', 'дистанц', 'работаете только', 'город'], 1.2),
  privacy: kw(['персональн', 'конфиденц', 'политик', 'cookie', 'куки', '152', 'мои данные', 'безопасн']),
  tech: kw(['wordpress', 'вордпресс', 'тильд', 'tilda', 'конструктор', 'cms', 'движ', 'битрикс', 'react', 'на чем', 'технологи', 'язык']),
  speed: [...kw(['скорость загруз', 'медленн', 'тормоз', 'лага', 'лаги', 'pagespeed', 'оптимизац', 'быстро загруж', 'быстрый сайт']), ...kw(['сайт быстр', 'сайты быстр'], 1.5)],
  design: kw(['дизайн', 'макет', 'figma', 'фигма', 'стиль', 'красив', 'анимац', '3d', 'трехмерн', 'визуал']),
  help: kw(['что умеешь', 'что ты умеешь', 'что можешь', 'помощь', 'help', 'какие вопросы', 'о чем спросить', 'меню'], 1.4),
  about: kw(['кто вы', 'кто такой', 'кто делает', 'о вас', 'о себе', 'опыт', 'сколько лет', 'макар', 'разработчик', 'команда'], 1.3),
  requisites: kw(['инн', 'реквизит', 'огрн', 'юрлиц', 'юридическ', 'статус'], 1.4),
  shop: kw(['магазин', 'каталог товар', 'корзин', 'маркетплейс', 'товар'], 1.4),
  other: kw(['приложени', 'телеграм', 'чат-бот', 'чат бот', 'логотип', 'фирменный стиль', 'smm', 'таргет', 'сео-тексты'], 1.2),
  discount: kw(['скидк', 'акци', 'промокод', 'дешевле', 'торг'], 1.4),
  hours: kw(['время работы', 'график', 'когда звонить', 'когда можно', 'выходн', 'в какое время', 'когда ответ', 'как быстро ответ'], 1.5),
  needs: kw(['что нужно от меня', 'что подготовить', 'что от меня', 'с моей стороны', 'что нужно для начала', 'что прислать'], 1.6),
  difference: kw(['чем отличается', 'разница', 'что выбрать', 'что лучше', 'какой сайт нужен', 'какой выбрать', 'что такое лендинг'], 1.5),
  pages: kw(['сколько страниц', 'страниц'], 1.1),
  admin: [...kw(['админк', 'редактир', 'самостоятельн', 'панель управлени']), ...kw(['сам менять', 'изменить текст', 'менять текст', 'обновлять сам'], 1.6)],
};
const AFFIRM = new Set(['да', 'давай', 'давайте', 'хочу', 'ок', 'окей', 'ага', 'конечно', 'поехали', 'согласен', 'согласна', 'хорошо', 'go', 'да хочу']);

export const DEFAULT_SUGGEST = ['Сколько стоит сайт?', 'Какие сроки?', 'Покажи примеры', 'Как проходит работа?', 'Как связаться?'];
// The «All questions» sheet. FAQ items from content.json that are not listed here are appended
// to the topic with the same title (or to a new one), so admin edits show up automatically.
const TOPICS = [
  { title: 'Стоимость и сроки', items: ['Сколько стоит сайт?', 'Сколько времени занимает разработка?', 'Как проходит оплата?', 'Бывают ли скидки?'] },
  { title: 'Услуги и примеры', items: ['Какие услуги?', 'Покажи примеры', 'Чем отличается лендинг от корпоративного?', 'Можно доработать уже существующий сайт?', 'Что входит в поддержку?'] },
  { title: 'Процесс', items: ['С чего начать?', 'Как проходит работа?', 'Нужно ли готовить тексты и фото?', 'Можно ли вносить правки?'] },
  { title: 'Технические вопросы', items: ['Будет ли сайт удобен на телефоне?', 'Поможете с доменом и хостингом?', 'Кому принадлежит готовый сайт?', 'На чём делаете сайты?', 'Сайт будет продвигаться в поиске?', 'Смогу сам менять тексты?'] },
  { title: 'Связь и документы', items: ['Как связаться?', 'Вы работаете только с Уфой?', 'Как быстро ответите?', 'Реквизиты и документы'] },
];
// Answers where the assistant's own reply is richer than the FAQ text (lists, examples, contacts).
const RICH = new Set(['price', 'timing', 'services', 'examples', 'contacts', 'difference', 'requisites']);

/* ---------- engine ---------- */
export function createBrain(getData) {
  const ctx = { last: null, service: null, offer: null, useService: false };
  const d = (path, fallback) => get(getData(), path) ?? fallback;
  const services = () => (d('services.items', []) || []);
  const serviceBy = (key) => services().find((s) => s.icon === key) || null;
  const phone = () => d('contacts.phone', '8 (987) 109-84-37');
  const email = () => d('contacts.email', 'makar.ulyanov.02@mail.ru');
  const faqAnswer = (needle) => {
    for (const c of d('faq.categories', []) || []) {
      for (const it of c.items || []) if (norm(it.q).includes(needle)) return it.a;
    }
    return '';
  };

  const act = {
    form: (service, label = 'Оставить заявку', brief) => ({ kind: 'form', label, service, brief }),
    call: () => ({ kind: 'link', label: 'Позвонить', href: d('contacts.phoneLink', 'tel:+79871098437') }),
    copy: (value, label) => ({ kind: 'copy', label, value }),
    mail: () => ({ kind: 'link', label: 'Написать на почту', href: d('contacts.emailLink', `mailto:${email()}`) }),
    section: (id, label) => ({ kind: 'section', id, label }),
    doc: (href, label) => ({ kind: 'doc', href, label }),
  };
  const exampleActions = () => (d('cases.items', []) || []).filter((c) => c.url).map((c) => ({
    kind: 'example', label: `Открыть: ${c.title}`, url: c.url, title: c.title, service: `сайт как пример «${c.title}»`,
  }));

  const svcLine = (s) => `${s.title} — стоимость ${s.price || 'по запросу'}, сроки ${s.term || 'обсуждаются'}.`;

  const answers = {
    greet: () => ({ text: ['Здравствуйте! Я помощник XLMNR. Подскажу стоимость, сроки, как проходит работа, покажу примеры. Выберите вопрос внизу или найдите свой во «Всех вопросах».'], suggest: DEFAULT_SUGGEST }),
    thanks: () => ({ text: ['Пожалуйста! Если появятся вопросы — пишите. А когда будете готовы, оставьте заявку: Макар ответит лично.'], actions: [act.form()], suggest: ['Покажи примеры', 'Как связаться?'] }),
    bye: () => ({ text: ['Хорошего дня! Если что — я здесь, а заявку можно оставить в любой момент.'], actions: [act.form()] }),
    who: () => ({ text: ['Я автоматический помощник сайта: отвечаю по базе знаний XLMNR — услуги, цены, сроки, документы.', `С Макаром лично можно связаться по телефону ${phone()} или через заявку.`], actions: [act.call(), act.form()] }),
    price: () => {
      const s = ctx.useService && ctx.service && serviceBy(ctx.service);
      if (s) {
        ctx.offer = 'form';
        return { text: [svcLine(s), 'Точную цену назову после короткого разговора: она зависит от объёма, функций и готовности текстов. Хотите обсудить?'], actions: [act.form(s.service || s.title, `Узнать цену: ${s.title}`), act.call()], suggest: ['Какие сроки?', 'Покажи примеры', 'Как проходит оплата?'] };
      }
      ctx.offer = 'form';
      return {
        text: ['Стоимость считается под задачу. Ориентиры по форматам:'],
        list: services().map(svcLine),
        after: 'Назову точную цену после короткого обсуждения. Оставить заявку?',
        actions: [act.form(undefined, 'Узнать цену'), act.call()],
        suggest: ['Сколько стоит лендинг?', 'Какие сроки?', 'Как проходит оплата?'],
      };
    },
    timing: () => {
      const s = ctx.useService && ctx.service && serviceBy(ctx.service);
      if (s) return { text: [`${s.title}: сроки ${s.term || 'обсуждаются индивидуально'}.`, 'Точные сроки фиксируем до старта работ — вместе с объёмом и стоимостью.'], actions: [act.form(s.service || s.title, 'Обсудить сроки')], suggest: ['Сколько стоит?', 'Как проходит работа?'] };
      return { text: [faqAnswer('сколько времени') || 'Сроки обсуждаются индивидуально и фиксируются до начала работ.'], list: services().map((x) => `${x.title} — ${x.term || 'обсуждаются'}`), actions: [act.form(undefined, 'Обсудить сроки')], suggest: ['Сколько стоит сайт?', 'Как проходит работа?'] };
    },
    services: () => ({ text: ['Вот что я делаю:'], list: services().map((s) => `${s.title} — ${s.text}`), actions: [act.section('services', 'Подробнее об услугах')], suggest: ['Сколько стоит лендинг?', 'Покажи примеры', 'Нужна доработка сайта'] }),
    service: () => {
      const s = serviceBy(ctx.service);
      if (!s) return answers.services();
      const example = ctx.service === 'landing' ? exampleActions().slice(0, 1) : [];
      ctx.offer = 'form';
      return { text: [`${s.title}. ${s.text}`], list: [...(s.bullets || []), `Стоимость: ${s.price || 'по запросу'}`, `Сроки: ${s.term || 'обсуждаются'}`], actions: [act.form(s.service || s.title, 'Обсудить проект'), ...example], suggest: ['Как проходит работа?', 'Покажи примеры', 'Как проходит оплата?'] };
    },
    process: () => ({ text: ['Работа идёт в четыре шага:'], list: (d('process.items', []) || []).map((p, i) => `${i + 1}. ${p.title} — ${p.text}`), actions: [act.form(undefined, 'Начать с обсуждения')], suggest: ['Сколько стоит сайт?', 'Как проходит оплата?', 'Можно вносить правки?'] }),
    payment: () => ({ text: [faqAnswer('оплата') || 'Порядок оплаты согласуем заранее; на каждую оплату формируется чек в «Мой налог».', 'Все условия — в публичной оферте.'], actions: [act.doc('./offer/', 'Открыть оферту'), act.form()], suggest: ['Сколько стоит сайт?', 'Кому принадлежит сайт?'] }),
    examples: () => {
      const ex = exampleActions();
      return { text: [ex.length ? 'Вот демо-сайты — откройте прямо здесь, можно переключить вид «Компьютер / Телефон»:' : 'Примеры собраны в разделе «Кейсы».', 'Это демо для вымышленных компаний — показывают стиль и качество вёрстки.'], actions: ex.length ? ex : [act.section('cases', 'Перейти к кейсам')], suggest: ['Хочу такой же', 'Сколько стоит сайт?'] };
    },
    contacts: () => ({ text: [`Телефон: ${phone()}`, `Email: ${email()}`, `${d('contacts.city', 'г. Уфа')}. ${d('contacts.replyNote', 'Отвечу в ВК или по телефону')}.`], actions: [act.call(), act.copy(phone(), 'Скопировать телефон'), act.copy(email(), 'Скопировать email'), act.form()] }),
    order: () => {
      ctx.offer = null;
      return { text: ['Отлично! Оставьте заявку: имя, удобный контакт и пару слов о задаче. Макар ответит в ВК или по телефону.'], actions: [act.form(ctx.service ? (serviceBy(ctx.service)?.service) : undefined, 'Перейти к заявке'), act.call()] };
    },
    hosting: () => ({ text: [faqAnswer('домен') || 'Помогу выбрать и подключить домен, хостинг и SSL-сертификат. Всё оформляется на ваше имя.'], suggest: ['Кому принадлежит сайт?', 'Что входит в поддержку?'] }),
    revisions: () => ({ text: [faqAnswer('правки') || 'Порядок и объём правок обсуждаем до старта и фиксируем вместе со стоимостью.'], suggest: ['Как проходит работа?', 'Сколько стоит сайт?'] }),
    content: () => ({ text: [faqAnswer('тексты') || 'Если материалов нет — помогу со структурой и текстами.'], suggest: ['Как проходит работа?', 'Сколько стоит сайт?'] }),
    mobile: () => ({ text: [faqAnswer('телефоне') || 'Да, сайт адаптируется под любые экраны.', 'Можете проверить на примерах: в окне просмотра есть переключатель «Телефон».'], actions: exampleActions().slice(0, 1), suggest: ['Покажи примеры'] }),
    seo: () => ({ text: ['В сайты закладываю базовую SEO-подготовку: понятную структуру и заголовки, мета-теги, быструю загрузку, адаптив и карту сайта.', 'Комплексное продвижение и реклама обсуждаются отдельно.'], actions: [act.form(undefined, 'Обсудить задачу')], suggest: ['Сколько стоит сайт?', 'Что входит в поддержку?'] }),
    rights: () => ({ text: [faqAnswer('принадлежит') || 'Права на результат переходят заказчику после оплаты — это закреплено в оферте.'], actions: [act.doc('./offer/', 'Открыть оферту')] }),
    guarantee: () => ({ text: ['Гарантийные условия обсуждаются индивидуально и фиксируются до начала работ — вместе с объёмом, сроками и стоимостью.'], actions: [act.form(undefined, 'Обсудить условия')], suggest: ['Что входит в поддержку?', 'Как проходит оплата?'] }),
    remote: () => ({ text: [faqAnswer('уфой') || 'Я нахожусь в Уфе, удалённый формат обсуждаем — большая часть работы и так идёт онлайн.'], actions: [act.form()] }),
    privacy: () => ({ text: ['Данные из формы используются только для ответа на заявку и не публикуются. Подробности — в документах:'], actions: [act.doc('./privacy/', 'Политика обработки ПДн'), act.doc('./consent/', 'Согласие на обработку')] }),
    tech: () => ({ text: ['Делаю сайты на чистом коде — HTML, CSS и JavaScript, без тяжёлых конструкторов, поэтому они быстро открываются.', 'Тексты и картинки можно менять самостоятельно через простую админку. Если нужен конкретный движок — обсудим.'], suggest: ['Почему сайт быстрый?', 'Покажи примеры'] }),
    speed: () => ({ text: ['Скорость — приоритет: лёгкий код, оптимизированные изображения, ленивая загрузка.', 'Тяжёлые эффекты включаются только на мощных устройствах — как на этом сайте: на слабых телефонах 3D и фоновые анимации отключаются, чтобы ничего не лагало.'], suggest: ['Покажи примеры', 'Сколько стоит сайт?'] }),
    design: () => ({ text: ['Дизайн делаю под задачу и аудиторию — от спокойного минимализма до 3D и анимаций, как на этом сайте. Сначала согласуем структуру и стиль, потом вёрстка.'], actions: exampleActions().slice(0, 2), suggest: ['Сколько стоит сайт?', 'Какие сроки?'] }),
    admin: () => ({ text: ['К сайту можно подключить простую админку: тексты, цены, контакты и карточки меняются без программиста.'], suggest: ['На чём делаете сайты?', 'Что входит в поддержку?'] }),
    help: () => ({ text: ['Я подскажу по любому базовому вопросу о сайте:'], list: ['стоимость и сроки по каждой услуге', 'как проходит работа и оплата', 'примеры сайтов — открою прямо здесь', 'домен, хостинг, правки, права на сайт', 'контакты и как оставить заявку'], suggest: DEFAULT_SUGGEST }),
    about: () => ({ text: [`Сайты делает ${d('requisites.fullName', 'Макар Ульянов')} — веб-разработчик из Уфы. ${d('requisites.shortName', 'Самозанятый')}: работает напрямую, без посредников и менеджеров.`, 'Посмотрите примеры — по ним видно стиль и качество работы.'], actions: [...exampleActions().slice(0, 1), act.form()], suggest: ['Покажи примеры', 'Как проходит работа?'] }),
    requisites: () => ({ text: [`${d('requisites.status', 'Самозанятый (НПД)')}: ${d('requisites.fullName', 'Ульянов Макар Максимович')}.`, [/^\d{10,12}$/.test(String(d('requisites.inn', ''))) && `ИНН: ${d('requisites.inn', '')}.`, `${d('requisites.address', 'г. Уфа')}.`].filter(Boolean).join(' '), 'Работа — по публичной оферте, на каждую оплату формируется чек.'], actions: [act.doc('./offer/', 'Открыть оферту')] }),
    shop: () => ({ text: ['Интернет-магазин отдельной услугой не указан. Опишите задачу в заявке — Макар скажет, сможет ли помочь и в каком формате лучше сделать (например, лендинг с каталогом и заявкой).'], actions: [act.form('интернет-магазин / каталог', 'Описать задачу')], suggest: ['Какие услуги?', 'Сколько стоит сайт?'] }),
    other: () => ({ text: ['Основная специализация — сайты: лендинги, корпоративные сайты, доработка и поддержка. По другим задачам спросите в заявке — Макар честно скажет, возьмётся ли.'], actions: [act.form()], suggest: ['Какие услуги?'] }),
    discount: () => ({ text: ['Стоимость считается под конкретную задачу, поэтому условия обсуждаются индивидуально. Расскажите о проекте — подберём разумный объём под ваш бюджет.'], actions: [act.form(undefined, 'Обсудить бюджет')], suggest: ['Сколько стоит сайт?'] }),
    hours: () => ({ text: ['Заявку можно оставить в любое время — она приходит сразу. Макар ответит в ВК или по телефону, как только сможет.', `Телефон: ${phone()}.`], actions: [act.form(), act.call()] }),
    needs: () => ({ text: ['Для старта достаточно рассказать о задаче: что за бизнес, для кого сайт, что должен делать посетитель. Если есть — пришлите логотип, тексты, фото и примеры сайтов, которые нравятся.', faqAnswer('тексты') || 'Если материалов нет — помогу со структурой и текстами.'], actions: [act.form(undefined, 'Рассказать о задаче')], suggest: ['Как проходит работа?'] }),
    difference: () => {
      const l = serviceBy('landing');
      const c = serviceBy('corporate');
      return { text: ['Коротко о форматах:'], list: [l && `${l.title}: ${l.text}`, c && `${c.title}: ${c.text}`].filter(Boolean), after: 'Если нужно продать одну услугу или собрать заявки с рекламы — подойдёт лендинг. Если нужно рассказать о компании и нескольких направлениях — корпоративный сайт.', actions: [act.form(undefined, 'Помочь выбрать')], suggest: ['Сколько стоит лендинг?', 'Покажи примеры'] };
    },
    pages: () => ({ text: ['Лендинг — это одна длинная страница. Корпоративный сайт — обычно несколько: главная, услуги, о компании, контакты, документы. Точный состав определим на этапе структуры.'], suggest: ['Чем отличается лендинг от корпоративного?', 'Сколько стоит сайт?'] }),
    fallback: (q) => ({
      text: [q ? 'Точного ответа в моей базе нет — но Макар ответит лично. Вопрос уже будет вписан в форму заявки.' : 'Выберите вопрос из списка — или задайте свой в заявке.'],
      actions: [act.form(undefined, 'Задать вопрос в заявке', q ? `Вопрос: ${q.slice(0, 200)}` : undefined), act.call()],
      suggest: DEFAULT_SUGGEST,
    }),
  };

  // FAQ items from content.json are intents too, so admin edits extend what the assistant knows.
  // Analysed once per content object, not on every reply.
  let faqCache = { src: undefined, list: [] };
  const faqItems = () => {
    const src = getData();
    if (faqCache.src !== src) {
      const list = (d('faq.categories', []) || []).flatMap((c) => (c.items || []).filter((it) => it && it.q && it.a).map((it) => ({
        n: norm(it.q),
        a: String(it.a),
        keys: analyse(it.q).stems.filter((t) => t.length >= 4).map((t) => [t, 0.45]),
      })));
      faqCache = { src, list };
    }
    return faqCache.list;
  };

  // A question picked from the FAQ list gets the FAQ answer itself, plus the matching intent's
  // buttons and follow-ups; for rich intents (price list, examples…) the intent's own answer wins.
  // opts.fresh: a question picked from the topic list is a new question, not a follow-up.
  function reply(text, opts = {}) {
    const res = route(text, opts);
    const exact = faqItems().find((f) => f.n === norm(text));
    if (!exact || RICH.has(ctx.last)) return res;
    return { text: [exact.a], actions: res.actions, suggest: res.suggest };
  }

  // The quiz result: the recommended format with its price, terms and the next step.
  reply.recommend = (key, summary) => {
    ctx.service = key;
    ctx.offer = 'form';
    const s = serviceBy(key);
    const why = {
      landing: 'Одна сильная страница под конкретное предложение: быстро запускается и хорошо собирает заявки с рекламы.',
      corporate: 'Несколько страниц — о компании, направления, контакты, документы: посетитель сам найдёт всё нужное.',
      refine: 'Начинать с нуля не нужно: проведу аудит, составлю список правок и ускорю то, что уже есть.',
      support: 'Возьму сайт на поддержку: обновление контента, мелкие доработки и контроль работоспособности.',
    }[key] || '';
    return {
      text: [`Вам подойдёт: ${s ? (s.service || s.title).toLowerCase() : 'сайт под вашу задачу'}.`, why],
      list: s ? [`Стоимость: ${s.price || 'по запросу'}`, `Сроки: ${s.term || 'обсуждаются'}`] : [],
      after: 'Оставьте заявку — ответы из подбора уже будут в форме, останется добавить контакт.',
      actions: [act.form(s ? (s.service || s.title) : undefined, 'Оставить заявку', summary), ...(key === 'landing' || key === 'corporate' ? exampleActions().slice(0, 1) : [])],
      suggest: ['Как проходит работа?', 'Как проходит оплата?', 'Покажи примеры'],
    };
  };

  reply.topics = () => {
    const topics = TOPICS.map((t) => ({ title: t.title, items: [...t.items] }));
    const known = new Set(topics.flatMap((t) => t.items.map(norm)));
    for (const c of d('faq.categories', []) || []) {
      for (const it of (c && c.items) || []) {
        if (!it || !it.q || known.has(norm(it.q))) continue;
        known.add(norm(it.q));
        let topic = topics.find((t) => t.title === c.title);
        if (!topic) topics.push(topic = { title: String(c.title || 'Ещё вопросы'), items: [] });
        topic.items.push(String(it.q));
      }
    }
    return topics;
  };
  reply.greeting = () => d('faq.botGreeting', '') || 'Здравствуйте! Я помощник XLMNR. Подскажу стоимость и сроки, расскажу, как проходит работа, и покажу примеры.';

  return reply;

  function route(text, { fresh = false } = {}) {
    const q = analyse(text);
    if (!q.words.length) return answers.fallback('');
    if (ctx.offer === 'form' && q.words.length <= 3 && q.words.some((w) => AFFIRM.has(w))) return { ...answers.order(), auto: 'form' };

    let svc = null;
    let svcScore = 0;
    for (const [key, keys] of Object.entries(SERVICE_KEYS)) {
      const sc = score(q, keys);
      if (sc > svcScore) { svc = key; svcScore = sc; }
    }
    let best = null;
    let bestScore = 0;
    for (const [id, keys] of Object.entries(INTENTS)) {
      let sc = score(q, keys);
      if ((id === 'greet' || id === 'thanks' || id === 'bye') && q.words.length > 5) sc *= 0.3;
      if (sc > bestScore) { best = id; bestScore = sc; }
    }
    const faq = faqItems().map((f) => ({ f, sc: score(q, f.keys) })).sort((a, b) => b.sc - a.sc)[0];

    if (svc) ctx.service = svc;
    // the remembered service applies to short follow-ups («а сроки?»), not to a new general question
    ctx.useService = Boolean(svc) || (!fresh && q.words.length <= 4 && !q.n.includes('сайт'));
    // «а для лендинга?» right after a price/timing answer → repeat that answer for the new service
    if (svc && (!best || bestScore < 1) && (ctx.last === 'price' || ctx.last === 'timing')) best = ctx.last;
    else if (svc && (!best || bestScore < 1)) best = 'service';

    if (!best && faq && faq.sc >= 0.9) { ctx.last = 'faq'; return { text: [faq.f.a], suggest: DEFAULT_SUGGEST }; }
    if (!best) { ctx.last = null; return answers.fallback(text); }
    if (best !== 'price' && best !== 'timing' && best !== 'service' && best !== 'order') ctx.offer = null;
    ctx.last = best;
    return answers[best](text);
  }
}

/* ---------- UI ---------- */
const STORE = 'xlmnr-bot';
const NUDGE = 'xlmnr-nudge';
const root = document.documentElement;

// «Pick a format»: a short branching quiz; the answers go into the request form.
const QUIZ = {
  site: { q: 'Есть ли у вас сайт сейчас?', options: [
    { label: 'Нет, нужен новый', next: 'goal' },
    { label: 'Есть, но устарел или медленный', next: 'fix' },
    { label: 'Есть, нужна поддержка', result: 'support' },
  ] },
  fix: { q: 'Что ближе к задаче?', options: [
    { label: 'Исправить и ускорить текущий', result: 'refine' },
    { label: 'Сделать новый с нуля', next: 'goal' },
  ] },
  goal: { q: 'Что сайт должен делать в первую очередь?', options: [
    { label: 'Собирать заявки на одну услугу', score: { landing: 2 }, next: 'size' },
    { label: 'Рассказывать о компании и направлениях', score: { corporate: 2 }, next: 'size' },
    { label: 'Пока не знаю — помогите решить', score: { landing: 1, corporate: 1 }, next: 'size' },
  ] },
  size: { q: 'Сколько у вас услуг или направлений?', options: [
    { label: 'Одна-две', score: { landing: 1.5 } },
    { label: 'Три и больше', score: { corporate: 1.5 } },
    { label: 'Много, плюс документы или каталог', score: { corporate: 2.5 } },
  ] },
};

// What the visitor was looking at when they opened the assistant decides the first chips.
const CONTEXT = {
  services: ['Сколько стоит сайт?', 'Какие сроки?', 'Чем отличается лендинг от корпоративного?'],
  process: ['Как проходит работа?', 'Можно ли вносить правки?', 'Как проходит оплата?'],
  cases: ['Покажи примеры', 'Хочу такой же', 'Сколько стоит сайт?'],
  advantages: ['На чём делаете сайты?', 'Кому принадлежит готовый сайт?', 'Сколько стоит сайт?'],
  request: ['Что нужно от меня?', 'Как быстро ответите?', 'Сколько стоит сайт?'],
  contacts: ['Как связаться?', 'Как быстро ответите?', 'Вы работаете только с Уфой?'],
};

function sectionInView() {
  const el = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2).find((n) => n.closest('main'));
  return el?.closest('section[id]')?.id || '';
}

export function initBot(contentPromise, openViewer) {
  const dlg = document.getElementById('bot');
  const log = document.getElementById('bot-log');
  const chips = document.getElementById('bot-choices');
  const sheet = document.getElementById('bot-sheet');
  const allBtn = document.getElementById('bot-all');
  const search = document.getElementById('bot-search');
  const topicsEl = document.getElementById('bot-topics');
  if (!dlg || !log || !chips || !sheet || !allBtn || !search || !topicsEl) return;
  let data = null;
  const brain = createBrain(() => data);
  contentPromise.then((c) => { data = c; if (!sheet.hidden) renderTopics(search.value); });
  let started = false;
  let busy = false;
  let history = []; // [{ u: 'text' } | { b: res }]
  let quiz = null;
  const smooth = () => (reduceMotion.matches ? 'auto' : 'smooth');

  /* ----- messages ----- */
  function actionNode(a) {
    if (a.kind === 'link') {
      const href = safeHref(a.href);
      return href ? h('a', { class: 'bot-act', href }, a.label) : null;
    }
    if (a.kind === 'doc') return h('a', { class: 'bot-act', href: a.href, 'data-viewer': true }, a.label);
    if (a.kind === 'form') return h('button', { type: 'button', class: 'bot-act bot-act--primary', 'data-scroll': 'request', 'data-service': a.service || null, 'data-brief': a.brief || null }, a.label);
    if (a.kind === 'section') return h('button', { type: 'button', class: 'bot-act', 'data-scroll': a.id }, a.label);
    if (a.kind === 'quiz') {
      const b = h('button', { type: 'button', class: 'bot-act bot-act--quiz' }, a.label);
      b.addEventListener('click', startQuiz);
      return b;
    }
    if (a.kind === 'copy') {
      const b = h('button', { type: 'button', class: 'bot-act' }, a.label);
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(a.value); b.textContent = 'Скопировано ✓'; } catch { b.textContent = a.value; }
        setTimeout(() => { b.textContent = a.label; }, 1800);
      });
      return b;
    }
    if (a.kind === 'example') {
      const b = h('button', { type: 'button', class: 'bot-act' }, icon('arrow', 14), a.label);
      b.addEventListener('click', () => openViewer({ url: a.url, title: a.title, kind: 'example', service: a.service }, b));
      return b;
    }
    return null;
  }

  function botNode(res, stale = false) {
    const msg = h('div', { class: 'msg msg--bot' });
    if (res.kicker) msg.append(h('p', { class: 'msg__kicker' }, res.kicker));
    (res.text || []).forEach((t) => msg.append(h('p', null, t)));
    if (res.list && res.list.length) msg.append(h('ul', { class: 'msg__list' }, res.list.map((t) => h('li', null, t))));
    if (res.after) msg.append(h('p', null, res.after));
    const acts = (res.actions || []).map(actionNode).filter(Boolean);
    if (acts.length) msg.append(h('div', { class: 'msg__actions' }, acts));
    if (res.options) {
      msg.append(h('div', { class: 'msg__options', role: 'group', 'aria-label': (res.text && res.text[0]) || 'Варианты' },
        res.options.map((label) => {
          const b = h('button', { type: 'button', class: 'bot-opt' }, label);
          if (stale) b.disabled = true;
          else b.addEventListener('click', () => pickQuiz(label, msg));
          return b;
        })));
    }
    return msg;
  }

  // Short answers keep the chat pinned to the bottom; a long one is shown from its first line.
  function reveal(msg) {
    const fits = msg.offsetHeight < log.clientHeight - 32;
    log.scrollTo({ top: fits ? log.scrollHeight : msg.offsetTop - 12, behavior: smooth() });
  }

  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify(history.slice(-60))); } catch { /* storage blocked */ }
  }

  function postUser(text) {
    log.append(h('p', { class: 'msg msg--user' }, text));
    history.push({ u: text });
    log.scrollTo({ top: log.scrollHeight, behavior: smooth() });
  }

  function postBot(res) {
    const { auto, ...plain } = res;
    const msg = botNode(plain);
    log.append(msg);
    history.push({ b: plain });
    save();
    reveal(msg);
    if (!quiz) setSuggest(res.suggest || DEFAULT_SUGGEST);
    if (auto === 'form') setTimeout(() => msg.querySelector('.bot-act--primary')?.click(), 700);
  }

  // The bot «types» for a moment proportional to the answer, then replies.
  function respond(res, delay) {
    if (reduceMotion.matches) { postBot(res); return; }
    busy = true;
    chips.classList.add('is-busy');
    log.setAttribute('aria-busy', 'true');
    const typing = h('div', { class: 'msg msg--bot msg--typing', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    log.append(typing);
    log.scrollTo({ top: log.scrollHeight, behavior: smooth() });
    const words = (res.text || []).join(' ').split(' ').length + (res.list || []).length * 6;
    setTimeout(() => {
      typing.remove();
      busy = false;
      chips.classList.remove('is-busy');
      log.removeAttribute('aria-busy');
      postBot(res);
    }, delay ?? Math.min(1100, 380 + words * 12));
  }

  function ask(text, opts) {
    const t = String(text || '').trim().slice(0, 300);
    if (!t || busy) return;
    if (quiz) cancelQuiz(false);
    closeSheet();
    postUser(t);
    respond(brain(t, opts));
  }

  /* ----- chips rail: one row, scrolls sideways, never covers the chat ----- */
  function setSuggest(list) {
    const nodes = [];
    if (quiz) {
      const b = h('button', { type: 'button', class: 'chip chip--ghost' }, 'Отменить подбор');
      b.addEventListener('click', () => cancelQuiz(true));
      nodes.push(b);
    } else {
      const q = h('button', { type: 'button', class: 'chip chip--accent' }, 'Подобрать формат');
      q.addEventListener('click', startQuiz);
      nodes.push(q);
      list.slice(0, 4).forEach((label) => {
        const b = h('button', { type: 'button', class: 'chip' }, label);
        b.addEventListener('click', () => ask(label));
        nodes.push(b);
      });
    }
    chips.replaceChildren(...nodes);
    chips.scrollLeft = 0;
  }

  chips.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = [...chips.querySelectorAll('button')];
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus();
  });

  /* ----- quiz ----- */
  function startQuiz() {
    if (busy) return;
    closeSheet();
    quiz = { step: 'site', score: { landing: 0, corporate: 0 }, answers: [], n: 1 };
    postUser('Подобрать формат сайта');
    setSuggest([]);
    respond(quizQuestion(), 450);
  }

  function quizQuestion() {
    const node = QUIZ[quiz.step];
    return { kicker: `Подбор формата · вопрос ${quiz.n}`, text: [node.q], options: node.options.map((o) => o.label) };
  }

  function pickQuiz(label, msg) {
    if (!quiz || busy) return;
    const node = QUIZ[quiz.step];
    const opt = node.options.find((o) => o.label === label);
    if (!opt) return;
    msg.querySelectorAll('.bot-opt').forEach((b) => {
      b.disabled = true;
      if (b.textContent === label) b.classList.add('is-picked');
    });
    quiz.answers.push(`${node.q} — ${label}`);
    for (const [k, v] of Object.entries(opt.score || {})) quiz.score[k] += v;
    postUser(label);
    if (opt.next) {
      quiz.step = opt.next;
      quiz.n += 1;
      respond(quizQuestion(), 420);
      return;
    }
    const key = opt.result || (quiz.score.corporate > quiz.score.landing ? 'corporate' : 'landing');
    const summary = `Подбор формата: ${quiz.answers.join('; ')}.`;
    quiz = null;
    respond(brain.recommend(key, summary), 700);
  }

  function cancelQuiz(say) {
    quiz = null;
    log.querySelectorAll('.bot-opt:not(:disabled)').forEach((b) => { b.disabled = true; });
    if (say) respond({ text: ['Хорошо, подбор отменён. Чем ещё помочь?'], suggest: DEFAULT_SUGGEST }, 350);
    else setSuggest(DEFAULT_SUGGEST);
  }

  /* ----- «all questions» sheet with search ----- */
  function renderTopics(filter = '') {
    const words = norm(filter).split(' ').filter((w) => w.length > 1).map(stem);
    const nodes = [];
    if (!words.length) {
      const b = h('button', { type: 'button', class: 'bot-quizcard' },
        h('span', { class: 'bot-quizcard__title' }, 'Подобрать формат сайта'),
        h('span', { class: 'bot-quizcard__text' }, '3 коротких вопроса — и я подскажу, что вам подойдёт, со стоимостью и сроками.'));
      b.addEventListener('click', startQuiz);
      nodes.push(b);
    } else {
      const b = h('button', { type: 'button', class: 'bot-q bot-q--ask' }, `Спросить: «${filter.trim().slice(0, 80)}»`);
      b.addEventListener('click', () => { const v = search.value; search.value = ''; ask(v); });
      nodes.push(b);
    }
    let found = 0;
    for (const t of brain.topics()) {
      const items = words.length ? t.items.filter((q) => words.every((w) => norm(q).includes(w))) : t.items;
      if (!items.length) continue;
      found += items.length;
      nodes.push(h('section', { class: 'bot__topic' },
        h('h3', { class: 'bot__topic-title' }, t.title),
        h('div', { class: 'bot__topic-list' }, items.map((q) => {
          const b = h('button', { type: 'button', class: 'bot-q' }, q);
          b.addEventListener('click', () => { search.value = ''; ask(q, { fresh: true }); });
          return b;
        }))));
    }
    if (words.length && !found) nodes.push(h('p', { class: 'bot__empty' }, 'Готового вопроса нет — нажмите «Спросить» или Enter, я поищу ответ в базе знаний.'));
    topicsEl.replaceChildren(...nodes);
  }

  function openSheet() {
    if (sheet.classList.contains('is-open')) return;
    renderTopics(search.value);
    sheet.hidden = false;
    dlg.classList.add('has-sheet');
    allBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    if (finePointer.matches) setTimeout(() => search.focus({ preventScroll: true }), 80);
  }

  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('is-open');
    dlg.classList.remove('has-sheet');
    allBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.hidden = true; }, reduceMotion.matches ? 0 : 320);
  }

  allBtn.addEventListener('click', () => (sheet.classList.contains('is-open') ? closeSheet() : openSheet()));
  dlg.querySelector('.bot__scrim')?.addEventListener('click', closeSheet);
  dlg.querySelector('[data-sheet-close]')?.addEventListener('click', () => { closeSheet(); allBtn.focus(); });
  search.addEventListener('input', () => renderTopics(search.value));
  search.closest('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = search.value;
    search.value = '';
    ask(v);
  });
  // Esc closes the sheet first, the window only on the next press.
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
      allBtn.focus();
    }
  }, true);

  /* ----- start, restore, reset ----- */
  function greet(topic) {
    respond({
      text: [brain.greeting()],
      actions: [{ kind: 'quiz', label: 'Подобрать формат сайта' }],
      suggest: CONTEXT[topic] || DEFAULT_SUGGEST,
    }, 350);
  }

  function restore() {
    let list = null;
    try { list = JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch { list = null; }
    if (!Array.isArray(list) || !list.length) return false;
    history = list.filter((m) => m && (typeof m.u === 'string' || (m.b && typeof m.b === 'object')));
    if (!history.length) return false;
    log.setAttribute('aria-live', 'off');
    history.forEach((m) => log.append(typeof m.u === 'string' ? h('p', { class: 'msg msg--user' }, m.u) : botNode(m.b, true)));
    log.setAttribute('aria-live', 'polite');
    const last = [...history].reverse().find((m) => m.b);
    setSuggest((last && last.b.suggest) || DEFAULT_SUGGEST);
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    return true;
  }

  dlg.querySelector('[data-bot-reset]')?.addEventListener('click', () => {
    if (busy) return;
    quiz = null;
    history = [];
    try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
    log.replaceChildren();
    closeSheet();
    greet('');
  });

  dlg.addEventListener('xl:open', (e) => {
    document.querySelector('.bot-fab')?.classList.add('is-seen');
    hideNudge(true);
    const opener = e.detail && e.detail.opener;
    const topic = (opener && opener.dataset && opener.dataset.botTopic) || sectionInView();
    if (!started) {
      started = true;
      if (!restore()) greet(topic);
    } else if (!busy && !quiz && CONTEXT[topic]) {
      setSuggest(CONTEXT[topic]);
    }
    if (topic === 'faq') setTimeout(openSheet, 380);
  });
  dlg.addEventListener('close', closeSheet);

  /* ----- one gentle nudge per visit ----- */
  let nudge = null;
  function hideNudge(forever) {
    if (forever) { try { sessionStorage.setItem(NUDGE, '1'); } catch { /* ignore */ } }
    if (!nudge) return;
    const n = nudge;
    nudge = null;
    n.classList.remove('is-in');
    setTimeout(() => n.remove(), 400);
  }
  function showNudge() {
    try { if (sessionStorage.getItem(NUDGE)) return; } catch { return; }
    const fab = document.querySelector('.bot-fab');
    if (!fab || nudge || started || root.classList.contains('is-locked') || root.classList.contains('cookie-pending')) return;
    hideNudge(true);
    const body = h('button', { type: 'button', class: 'bot-nudge__body' },
      h('span', { class: 'bot-nudge__title' }, 'Подсказать стоимость?'),
      h('span', { class: 'bot-nudge__text' }, 'Отвечу за пару секунд или подберу формат сайта'));
    const close = h('button', { type: 'button', class: 'bot-nudge__close', 'aria-label': 'Скрыть подсказку' }, '×');
    nudge = h('div', { class: 'bot-nudge', role: 'status' }, body, close);
    body.addEventListener('click', () => fab.click());
    close.addEventListener('click', () => hideNudge(true));
    document.body.append(nudge);
    requestAnimationFrame(() => requestAnimationFrame(() => nudge && nudge.classList.add('is-in')));
    setTimeout(() => hideNudge(false), 14000);
  }
  const cases = document.getElementById('cases');
  if (cases) {
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      setTimeout(showNudge, 1600);
    }, { threshold: 0.3 });
    io.observe(cases);
  }
  setTimeout(showNudge, 45000);
}
