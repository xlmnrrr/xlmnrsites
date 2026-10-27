# xlmnr.ru — сайт самозанятого XLMNR (Уфа, создание сайтов)

Статический сайт на чистом HTML/CSS/JS (без сборщиков и npm). Контент — `data/content.json`, редактируется в `/admin/`. Заявки уходят в Yandex Cloud Function → ВКонтакте (`backend/ycf/`).

## Структура

```
index.html                 главная (статичный снимок контента для SEO и работы без JS)
privacy/ consent/ offer/   политика ПДн, согласие, оферта (чистые URL /privacy/ …)
404.html  .nojekyll  robots.txt  sitemap.xml
data/content.json          весь текст, контакты, реквизиты, настройки (formEndpoint, metrikaId)
admin/                     редактор content.json через GitHub Contents API
assets/css/main.css        дизайн-система Quiet Design (токены в :root)
assets/js/
  boot.js                  синхронно в <head>: класс .js, F5 → сверху, прелоадер 1 раз за сессию
  app.js                   точка входа главной
  content.js               загрузка JSON + безопасная подстановка (textContent, проверка href)
  render.js                списки (услуги, кейсы, …) из JSON, диалог кейса
  nav.js                   скролл без #, модалки без прыжков, блокировка прокрутки
  form.js                  валидация, honeypot, отправка, понятные ошибки + телефон/email
  faq.js                   вкладки, аккордеон, FAQ-помощник (скриптовый, не ИИ)
  consent.js               cookie-баннер, Метрика только после «Принять все»
  fx.js                    прелоадер, split text, reveal, магнитные кнопки, tilt, курсор, sticky CTA
  stages.js                решает, грузить ли 3D (гейты), CSS-фолбэк конструктора
  three-kit.js             общий WebGL-рендерер, геометрия, процедурные текстуры
  hero3d.js  scene-b.js    сцены «Стек окон» и «Конструктор страниц»
assets/vendor/three.custom.min.js   Three.js r160 (MIT), сборка из dorozhnik-site2
assets/img/                постер hero, OG, иконки, иллюстрации кейсов (SVG)
tools/poster.html          генератор постера hero (canvas → webp)
backend/ycf/               функция приёма заявок, см. её README
```

## Локально

```bash
python -m http.server 8000
```

Открыть http://localhost:8000. Параметр `?3d=1` принудительно включает 3D (для проверки на узком окне), `?3d=0` — выключает.

## Деплой (GitHub Pages)

Сейчас — превью без своего домена: **https://xlmnrrr.github.io/xlmnrsites/**.

1. `git push` в `main` репозитория `xlmnrrr/xlmnrsites`.
2. Settings → Pages → Source: *Deploy from a branch*, `main` / root.

Все пути относительные (`./assets/…`, `../privacy/` и т. п.), `content.json` и картинки кейсов резолвятся от корня сайта через `import.meta.url`, поэтому сайт работает и в подпапке `/xlmnrsites/`, и в корне домена. Исключение — `404.html`: GitHub отдаёт его по любому адресу, поэтому в нём `<base href="/xlmnrsites/">`.

### Когда подключим xlmnr.ru
1. Добавить файл `CNAME` с `xlmnr.ru`, в Settings → Pages указать домен и включить **Enforce HTTPS**.
2. DNS: `A` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `AAAA` → `2606:50c0:8000::153` … `2606:50c0:8003::153`; `CNAME www` → `xlmnrrr.github.io`.
3. В `404.html` заменить `<base href="/xlmnrsites/">` на `<base href="/">`.
4. Заменить `https://xlmnrrr.github.io/xlmnrsites` на `https://xlmnr.ru` в `canonical`/`og:*`/JSON-LD (`index.html`, `privacy/`, `consent/`, `offer/`, `404.html`) и в `sitemap.xml`; в `robots.txt` убрать префикс `/xlmnrsites` и вернуть строку `Sitemap: https://xlmnr.ru/sitemap.xml`.

## Контент и админка

`/admin/` → вставить fine-grained PAT (только репозиторий `xlmnrrr/xlmnrsites`, *Contents: Read and write*) → править → «Сохранить на GitHub». Pages пересобирается за 1–2 минуты. Токен хранится только в браузере; при 401/403 админка пишет «Токен истёк/неверный». Секреты в `content.json` админка сохранить не даст.

Что заполнить: `requisites.inn`, цены/сроки в услугах, реальные кейсы, `settings.formEndpoint` (URL функции), `settings.metrikaId`, блок `numbers` — только с реальными данными (`enabled: true`).

## 3D

- Грузится только если: ширина ≥ 1024, нет `prefers-reduced-motion`, нет Save-Data, `hardwareConcurrency > 4`, `deviceMemory > 4` (где есть), есть WebGL2. Иначе — постер `hero-poster@{1x,2x}.webp` и CSS-версия конструктора.
- Один рендерер на сайт, активна только видимая сцена; неактивная через 5 с вне экрана освобождает GPU-ресурсы. Пауза при скрытой вкладке, адаптивный DPR (≤ 2, ≤ 1.6 Мпикс).
- «Конструктор» в «Услугах»: прогресс сборки следует за скроллом с плавным догоном, блоки летят по дугам и «щёлкают» при посадке, сверху вниз идёт печатающая головка; после сборки курсор нажимает CTA и наводится на карточки. Рендерится, только пока сцена на экране.
- Локально браузер может держать старые JS-модули в кэше: обновляйте с Ctrl+F5 или открывайте http://127.0.0.1:8000.
- Вес по сети (gzip): Three.js ≈ 123 КБ + сцены ≈ 12 КБ + постер ≈ 47 КБ.
- Постер пересобирается так: открыть `/tools/poster.html` → «Скачать» оба файла → положить в `assets/img/`.

## Заголовки безопасности при переезде в Yandex Cloud

GitHub Pages не позволяет задать заголовки, поэтому CSP — в `<meta>`. В Yandex Cloud (Object Storage + Cloud CDN или API Gateway) отдавайте заголовками:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: <как в meta + frame-ancestors 'none'>
```

TLS ≥ 1.2. Object Storage **не сжимает** файлы сам: включите сжатие в Cloud CDN или загружайте предсжатые `.js/.css/.json` с `Content-Encoding: gzip`, иначе Three.js уйдёт по сети 488 КБ вместо 123 КБ. Структура файлов при переезде не меняется (страницы уже лежат как `папка/index.html`).
