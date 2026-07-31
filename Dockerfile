# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ВНИМАНИЕ: next/font/google (Playfair Display + Inter в app/layout.tsx) скачивает
# шрифты С СЕТИ на этапе `npm run build`. Билдеру нужен доступ к fonts.googleapis.com.
# Если билд падает на шрифтах (нет сети / гугл заблокирован):
#   1. В app/layout.tsx убрать импорт из 'next/font/google' и вызовы Playfair_Display/Inter,
#      убрать классы ${heading.variable} ${body.variable} с <html>.
#   2. Ничего больше менять не нужно — в app/globals.css уже прописаны системные
#      фолбэки: Georgia/serif для заголовков, Segoe UI/sans-serif для текста.
# NEXT_PUBLIC_* переменные инлайнятся на этапе билда
ARG NEXT_PUBLIC_METRIKA_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ARG NEXT_PUBLIC_YANDEX_VERIFICATION
ENV NEXT_PUBLIC_METRIKA_ID=$NEXT_PUBLIC_METRIKA_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=$NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ENV NEXT_PUBLIC_YANDEX_VERIFICATION=$NEXT_PUBLIC_YANDEX_VERIFICATION
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Лёгкий healthcheck: /api/health вместо тяжёлой главной.
# wget есть в busybox (alpine), curl ставить не нужно.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
