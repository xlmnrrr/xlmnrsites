#!/usr/bin/env sh
# Проверка реального эндпоинта Yandex Cloud Function curl-ом.
# Использование: ./test-payload.sh https://functions.yandexcloud.net/<function_id>
set -eu

URL="${1:?Укажите URL функции: ./test-payload.sh https://functions.yandexcloud.net/<id>}"
ORIGIN="${ORIGIN:-https://xlmnr.ru}"

echo "1) CORS preflight (ожидается 204 и Access-Control-Allow-Headers: Content-Type)"
curl -si -X OPTIONS "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" | sed -n '1,12p'
echo

echo "2) Валидная заявка (ожидается 200 {\"ok\":true} и сообщение в ВК)"
curl -si -X POST "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data '{"name":"Тест","contact":"+7 900 000-00-00","message":"Проверка curl","consent":true,"ts":0,"page":"https://xlmnr.ru/","website":""}'
echo; echo

echo "3) Без согласия (ожидается 400)"
curl -s -X POST "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data '{"name":"Тест","contact":"test@example.com","consent":false}'
echo; echo

echo "4) Honeypot заполнен (ожидается 200, но в ВК ничего не придёт)"
curl -s -X POST "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data '{"name":"Bot","contact":"bot@example.com","consent":true,"website":"http://spam"}'
echo; echo

echo "5) Чужой Origin (ожидается 403)"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
  -H "Origin: https://evil.example" \
  -H "Content-Type: application/json" \
  --data '{"name":"Тест","contact":"t@t.ru","consent":true}'
