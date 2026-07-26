# Мультилендинг — юридическая антикризисная служба

Движок посадочных страниц на Next.js 15 (App Router, TypeScript). Страницы генерируются из конфига `content/landings.ts`, не хардкодятся.

## Локальный запуск

```bash
npm install
npm run dev        # http://localhost:3170

# продакшен-сборка и локальное превью
npm run build
npm start          # http://localhost:3171
```

Порты 3170 (dev) и 3171 (превью) закреплены за проектом — на машине параллельно
работают другие проекты со своими портами. Порт `3000` ниже — внутренний порт
контейнера, к локальным не относится.

## Переменные окружения

Все переменные опциональны для сборки — без них проект билдится и работает (см. `.env.example`).

| Переменная | Где читается | Без значения |
|---|---|---|
| `NEXT_PUBLIC_METRIKA_ID` | клиент (инлайн при билде) | Метрика отключена |
| `TELEGRAM_BOT_TOKEN` | только сервер | заявка уходит в fallback-лог, клиент видит успех |
| `TELEGRAM_CHAT_ID` | только сервер | то же самое |
| `TELEGRAM_WEBHOOK_SECRET` | только сервер, `/api/telegram/webhook` | вебхук принимает запросы без проверки подлинности |
| `NEXT_PUBLIC_SITE_URL` | sitemap/robots/canonical/JSON-LD (инлайн при билде) | фолбэк `https://mitragost.ru` |

Важно: `NEXT_PUBLIC_*` инлайнятся на этапе **билда** — при смене значения нужен ребилд, а не рестарт.

## Деплой на Coolify

1. Новый ресурс → Application → Git-репозиторий, ветка `main`.
2. Build Pack: **Dockerfile** (лежит в корне).
3. Env: задать `NEXT_PUBLIC_METRIKA_ID`, `NEXT_PUBLIC_SITE_URL` как **Build Variables** (инлайнятся при билде, в Dockerfile объявлены как ARG), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` — как runtime-переменные.
4. Порт приложения: `3000` (внутри контейнера; с локальными 3170/3171 не пересекается).
5. Healthcheck: `GET /api/health` → `{"status":"ok"}` (в Dockerfile уже есть HEALTHCHECK; в Coolify можно указать путь `/api/health`).

Нюанс: при билде скачиваются шрифты Google (`next/font/google`) — билдеру нужна сеть. Если билд падает на шрифтах, инструкция по переходу на системные — в комментарии в `Dockerfile`.

## Как добавить новую посадочную

1. Открыть `content/landings.ts`.
2. Добавить новый объект `Landing` в `landings` с уникальным ключом-слагом:

```ts
'blokirovka-115fz': {
  slug: 'blokirovka-115fz',
  cluster: 'B',
  h1: '…',
  // …остальные поля по типу Landing
},
```

3. Всё. Страница `/blokirovka-115fz`, мета-теги, JSON-LD, sitemap подхватятся автоматически при следующем билде.

## Структура

- `content/landings.ts` — источник правды по посадочным (типизирован)
- `app/[slug]/page.tsx` — шаблон посадочной (SSG, `generateStaticParams`)
- `app/api/lead/route.ts` — приём заявок: honeypot, rate limit, отправка в Telegram
- `app/api/telegram/webhook/route.ts` — бот-секретарь: приём сообщений, пересылка в группу, ответ клиенту
- `lib/telegram.ts` — отправка в Telegram и формат сообщений
- `app/api/health/route.ts` — healthcheck
- `lib/analytics.ts` — цели Метрики (`qualifier_started`, `qualifier_submitted`, `lead_created`, `telegram_click`, `phone_click`) + сбор utm_*
- `lib/schema.ts` — JSON-LD (LegalService, FAQPage)
- `app/globals.css` — дизайн-токены в `:root` (перекраска в одном месте)
