// Site assistant: understands free-text questions with a local intent matcher (Russian stemming,
// synonyms, typo tolerance, dialogue context) and answers from content.json — prices, terms, process,
// cases, contacts, FAQ. Honest by design: it is a knowledge-base assistant, not a neural network.
// Everything the visitor types stays in the browser and is rendered with textContent only.
import { get, h, safeHref, icon } from './content.js';
import { reduceMotion } from './env.js';

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
  speed: kw(['скорость загруз', 'медленн', 'тормоз', 'лага', 'лаги', 'pagespeed', 'оптимизац', 'быстро загруж', 'быстрый сайт']),
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

const DEFAULT_SUGGEST = ['Сколько стоит сайт?', 'Какие сроки?', 'Покажи примеры', 'Как проходит работа?', 'Как связаться?'];

/* ---------- engine ---------- */
export function createBrain(getData) {
  const ctx = { last: null, service: null, offer: null };
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
    form: (service, label = 'Оставить заявку') => ({ kind: 'form', label, service }),
    call: () => ({ kind: 'link', label: 'Позвонить', href: d('contacts.phoneLink', 'tel:+79871098437') }),
    mail: () => ({ kind: 'link', label: 'Написать на почту', href: d('contacts.emailLink', `mailto:${email()}`) }),
    section: (id, label) => ({ kind: 'section', id, label }),
    doc: (href, label) => ({ kind: 'doc', href, label }),
  };
  const exampleActions = () => (d('cases.items', []) || []).filter((c) => c.url).map((c) => ({
    kind: 'example', label: `Открыть: ${c.title}`, url: c.url, title: c.title, service: `сайт как пример «${c.title}»`,
  }));

  const svcLine = (s) => `${s.title} — стоимость ${s.price || 'по запросу'}, сроки ${s.term || 'обсуждаются'}.`;

  const answers = {
    greet: () => ({ text: ['Здравствуйте! Я помощник XLMNR. Подскажу стоимость, сроки, как проходит работа, покажу примеры. Спрашивайте своими словами.'], suggest: DEFAULT_SUGGEST }),
    thanks: () => ({ text: ['Пожалуйста! Если появятся вопросы — пишите. А когда будете готовы, оставьте заявку: Макар ответит лично.'], actions: [act.form()], suggest: ['Покажи примеры', 'Как связаться?'] }),
    bye: () => ({ text: ['Хорошего дня! Если что — я здесь, а заявку можно оставить в любой момент.'], actions: [act.form()] }),
    who: () => ({ text: ['Я автоматический помощник: отвечаю по базе знаний этого сайта — услуги, цены, сроки, документы. Это не нейросеть и не живой человек.', `С живым человеком — Макаром — можно связаться по телефону ${phone()} или через заявку.`], actions: [act.call(), act.form()] }),
    price: (q) => {
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
    contacts: () => ({ text: [`Телефон: ${phone()}`, `Email: ${email()}`, `${d('contacts.city', 'г. Уфа')}. ${d('contacts.replyNote', 'Отвечу в ВК или по телефону')}.`], actions: [act.call(), act.mail(), act.form()] }),
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
    requisites: () => ({ text: [`${d('requisites.status', 'Самозанятый (НПД)')}: ${d('requisites.fullName', 'Ульянов Макар Максимович')}.`, `ИНН: ${d('requisites.inn', 'уточняется')}. ОГРНИП: ${d('requisites.ogrnip', 'отсутствует')}. ${d('requisites.address', 'г. Уфа')}.`, 'Работа — по публичной оферте, на каждую оплату формируется чек.'], actions: [act.doc('./offer/', 'Открыть оферту')] }),
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
      text: ['Точного ответа в моей базе нет — но Макар ответит лично. Задайте вопрос в заявке или позвоните.'],
      actions: [act.form(`вопрос «${q.slice(0, 80)}»`, 'Задать вопрос в заявке'), act.call()],
      suggest: DEFAULT_SUGGEST,
    }),
  };

  // FAQ items from content.json are intents too, so admin edits extend what the assistant knows.
  const faqIntents = () => (d('faq.categories', []) || []).flatMap((c) => (c.items || []).map((it) => ({
    keys: analyse(it.q).stems.filter((t) => t.length >= 4).map((t) => [t, 0.45]),
    answer: () => ({ text: [it.a] }),
  })));

  return function reply(text) {
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
    const faq = faqIntents().map((f) => ({ f, sc: score(q, f.keys) })).sort((a, b) => b.sc - a.sc)[0];

    if (svc) ctx.service = svc;
    // the remembered service applies to short follow-ups («а сроки?»), not to a new general question
    ctx.useService = Boolean(svc) || (q.words.length <= 4 && !q.n.includes('сайт'));
    // «а для лендинга?» right after a price/timing answer → repeat that answer for the new service
    if (svc && (!best || bestScore < 1) && (ctx.last === 'price' || ctx.last === 'timing')) best = ctx.last;
    else if (svc && (!best || bestScore < 1)) best = 'service';

    if (!best && faq && faq.sc >= 0.9) { ctx.last = 'faq'; return faq.f.answer(); }
    if (!best) { ctx.last = null; return answers.fallback(text); }
    if (best !== 'price' && best !== 'timing' && best !== 'service' && best !== 'order') ctx.offer = null;
    ctx.last = best;
    return answers[best](text);
  };
}

/* ---------- UI ---------- */
export function initBot(contentPromise, openViewer) {
  const dlg = document.getElementById('bot');
  const log = document.getElementById('bot-log');
  const chips = document.getElementById('bot-choices');
  const form = document.getElementById('bot-form');
  const input = document.getElementById('bot-input');
  if (!dlg || !log || !chips || !form || !input) return;
  let data = null;
  contentPromise.then((c) => { data = c; });
  const brain = createBrain(() => data);
  let started = false;
  let busy = false;

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function actionNode(a) {
    if (a.kind === 'link') {
      const href = safeHref(a.href);
      return href ? h('a', { class: 'bot-act', href }, a.label) : null;
    }
    if (a.kind === 'doc') return h('a', { class: 'bot-act', href: a.href, 'data-viewer': true }, a.label);
    if (a.kind === 'form') return h('button', { type: 'button', class: 'bot-act bot-act--primary', 'data-scroll': 'request', 'data-service': a.service || null }, a.label);
    if (a.kind === 'section') return h('button', { type: 'button', class: 'bot-act', 'data-scroll': a.id }, a.label);
    if (a.kind === 'example') {
      const b = h('button', { type: 'button', class: 'bot-act' }, icon('arrow', 14), a.label);
      b.addEventListener('click', () => openViewer({ url: a.url, title: a.title, kind: 'example', service: a.service }, b));
      return b;
    }
    return null;
  }

  function botMessage(res) {
    const msg = h('div', { class: 'msg msg--bot' });
    (res.text || []).forEach((t) => msg.append(h('p', null, t)));
    if (res.list && res.list.length) msg.append(h('ul', { class: 'msg__list' }, res.list.map((t) => h('li', null, t))));
    if (res.after) msg.append(h('p', null, res.after));
    const acts = (res.actions || []).map(actionNode).filter(Boolean);
    if (acts.length) msg.append(h('div', { class: 'msg__actions' }, acts));
    log.append(msg);
    setSuggest(res.suggest);
    scrollDown();
    if (res.auto === 'form') setTimeout(() => acts[0]?.click(), 700);
  }

  function setSuggest(list) {
    chips.replaceChildren(...(list || []).map((label) => {
      const b = h('button', { type: 'button', class: 'chip' }, label);
      b.addEventListener('click', () => ask(label));
      return b;
    }));
  }

  function ask(text) {
    const t = String(text || '').trim().slice(0, 300);
    if (!t || busy) return;
    busy = true;
    log.append(h('p', { class: 'msg msg--user' }, t));
    scrollDown();
    const res = brain(t);
    const done = () => { busy = false; botMessage(res); };
    if (reduceMotion.matches) { done(); return; }
    const typing = h('p', { class: 'msg msg--bot msg--typing', 'aria-label': 'Печатает…' }, h('i'), h('i'), h('i'));
    log.append(typing);
    scrollDown();
    const words = (res.text || []).join(' ').split(' ').length + (res.list || []).length * 6;
    setTimeout(() => { typing.remove(); done(); }, Math.min(1100, 380 + words * 12));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    ask(t);
  });

  dlg.addEventListener('xl:open', () => {
    document.querySelector('.bot-fab')?.classList.add('is-seen');
    if (started) return;
    started = true;
    botMessage({ text: ['Здравствуйте! Я помощник XLMNR. Подскажу стоимость, сроки, как проходит работа, покажу примеры.', 'Напишите вопрос своими словами или выберите тему ниже.'], suggest: DEFAULT_SUGGEST });
  });
  // Focus the input on desktop only — on phones the keyboard would cover the answers.
  dlg.addEventListener('xl:open', () => {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => input.focus({ preventScroll: true }), 60);
  });
}
