# Приём заявок: Yandex Cloud Function → ВКонтакте

Цепочка: браузер → `fetch POST application/json` → **эта функция** → `VK API messages.send` (`x-www-form-urlencoded`) → личные сообщения ВК. Если ВК недоступен и заданы `SMTP_*` — заявка дублируется на почту.

Файлы: `handler.js` (без npm-зависимостей, Node.js 20), `package.json`, `test-local.js` (офлайн-тесты с моком fetch), `test-payload.sh` (curl по реальному URL).

## Формат запроса и ответа

```http
POST <URL функции>
Origin: https://xlmnr.ru
Content-Type: application/json

{"name":"Анна","contact":"+7 900 000-00-00","message":"…","consent":true,"ts":1761571200000,"page":"https://xlmnr.ru/","website":""}
```

| Ситуация | Код | Тело |
|---|---|---|
| Доставлено в ВК | 200 | `{"ok":true}` |
| ВК упал, ушло на почту | 200 | `{"ok":true,"channel":"email"}` |
| Ошибка полей / нет согласия / битый JSON | 400 | `{"ok":false,"error":"…"}` |
| Чужой Origin | 403 | `{"ok":false,"error":"Origin not allowed"}` |
| Не JSON | 415 | — |
| > 5 заявок за 10 мин с одного IP | 429 | — |
| Не заданы `VK_TOKEN` / `VK_PEER_ID` | 503 | `VK token missing` / `VK peer_id missing` |
| ВК вернул ошибку | 502 | `VK API error: <code> <msg>` |

Honeypot (`website` не пустой) → `200 {"ok":true}` без отправки. На любые не-`ok` ответы сайт показывает «Заявка не отправлена» + телефон и email. Если не доставлено никуда — заявка пишется в лог функции (Cloud Logging), чтобы не потерялась.

## Переменные окружения

| Переменная | Обязательно | Значение |
|---|---|---|
| `VK_TOKEN` | да | Токен сообщества ВК с правом «Сообщения сообщества» (рекомендуется) или пользовательский токен с `messages`. **Только в env/Lockbox, никогда в репозиторий и content.json.** |
| `VK_PEER_ID` | да | Кому писать: ваш числовой user id (вы должны разрешить сообществу писать вам) или `2000000000 + id беседы`. |
| `VK_API_VERSION` | нет | По умолчанию `5.199`. |
| `ALLOWED_ORIGINS` | нет | Через пробел: `https://xlmnr.ru https://xlmnrrr.github.io http://localhost:8000` (по умолчанию именно так; github.io — для превью на GitHub Pages). Пробел, а не запятая — у `yc --environment` запятая разделяет переменные. |
| `SMTP_HOST`, `SMTP_PORT` | нет | Для Mail.ru: `smtp.mail.ru`, `465` (только неявный TLS; STARTTLS/587 не поддерживается). |
| `SMTP_USER`, `SMTP_PASS` | нет | Ящик и **пароль для внешних приложений** (не основной пароль). |
| `SMTP_FROM`, `SMTP_TO` | нет | По умолчанию `FROM = SMTP_USER`, `TO = makar.ulyanov.02@mail.ru`. |

Как получить токен сообщества: Сообщество → Управление → Работа с API → Ключи доступа → создать ключ с правом «Сообщения сообщества». Включите «Сообщения» в сообществе и напишите сообществу первым (или разрешите сообщения), иначе ВК вернёт ошибку 901.

## Деплой через yc CLI

```bash
cd backend/ycf
zip -j function.zip handler.js package.json

yc serverless function create --name xlmnr-lead

# Секреты — через Lockbox (рекомендуется):
yc lockbox secret create --name xlmnr-vk --payload '[{"key":"VK_TOKEN","text_value":"<токен>"}]'
# сервисному аккаунту функции нужна роль lockbox.payloadViewer на этот секрет

yc serverless function version create \
  --function-name xlmnr-lead \
  --runtime nodejs20 \
  --entrypoint handler.handler \
  --memory 128m \
  --execution-timeout 15s \
  --source-path ./function.zip \
  --service-account-id <id сервисного аккаунта> \
  --secret environment-variable=VK_TOKEN,id=<id секрета>,key=VK_TOKEN \
  --environment VK_PEER_ID=<peer_id>,VK_API_VERSION=5.199
# ALLOWED_ORIGINS не задаём: значение по умолчанию уже «https://xlmnr.ru https://xlmnrrr.github.io http://localhost:8000».
# Чтобы изменить список — задайте переменную в консоли (Редактор → Переменные окружения).

yc serverless function allow-unauthenticated-invoke xlmnr-lead
yc serverless function get xlmnr-lead   # → http_invoke_url: https://functions.yandexcloud.net/<id>
```

Упрощённо (без Lockbox) токен можно задать в консоли: Функция → Редактор → Переменные окружения → `VK_TOKEN`. Не кладите его в скрипты, которые коммитятся.

После деплоя впишите URL в админке: **Настройки → URL приёма заявок** (`settings.formEndpoint`).

## Проверка

```bash
node test-local.js                        # офлайн: CORS, валидация, honeypot, form-urlencoded для VK
./test-payload.sh https://functions.yandexcloud.net/<id>   # реальный эндпоинт: придёт сообщение в ВК
```

`test-local.js` не обращается к ВК — он подтверждает только формат запроса. Реальную доставку (токен, peer_id, права сообщества) подтверждает только шаг 2 из `test-payload.sh`.

## Свой домен для API (позже)

Требование «API через свой домен» выполняется через Yandex API Gateway с доменом `api.xlmnr.ru` (сертификат — Certificate Manager), интеграция `cloud_functions` на эту функцию. После этого:
1. обновите `settings.formEndpoint` на `https://api.xlmnr.ru/lead`;
2. в CSP (`index.html`, мета-тег) замените `https://functions.yandexcloud.net https://*.apigw.yandexcloud.net` на `https://api.xlmnr.ru`.
