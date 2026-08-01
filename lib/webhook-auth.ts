/**
 * Проверка подлинности вебхука Telegram.
 *
 * Это единственная граница доверия у бота: за ней лежат отправка сообщений в
 * произвольный чат, запись в память диалога и платные вызовы модели. Никаких
 * других проверок дальше по коду нет — `chat.id` приходит из тела запроса и
 * принимается как есть.
 *
 * Отсюда два правила.
 *
 * 1. FAIL-CLOSED. Прежняя проверка выглядела как
 *    `if (secret && header !== secret) return 401` — при незаданной переменной
 *    условие схлопывалось в `false`, и роут принимал любой POST из интернета.
 *    Опечатка в имени переменной или перенос окружения без неё открывали бота
 *    наружу молча: снаружи это не отличить от исправной работы. Теперь
 *    отсутствие секрета означает «не пропускаем никого», а не «пропускаем всех».
 *
 * 2. Сравнение постоянное по времени. Секрет — общий для всего трафика бота,
 *    и подобрать его побайтово по времени ответа было бы реально: обычное `!==`
 *    на строках выходит из сравнения на первом несовпавшем символе. Сравниваем
 *    не сами значения, а их SHA-256: длина у дайджестов всегда одна (32 байта),
 *    поэтому `timingSafeEqual` применим всегда и не приходится отдельно решать,
 *    что делать с разной длиной входа — она перестаёт быть наблюдаемой.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Пустое значение — это отсутствие секрета, а не секрет из пробелов. */
function configuredSecret(): string {
  return (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
}

export function isWebhookSecretConfigured(): boolean {
  return configuredSecret().length > 0;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Совпадает ли заголовок `X-Telegram-Bot-Api-Secret-Token` с настроенным
 * секретом. Секрет не настроен → `false` при любом заголовке.
 */
export function verifyWebhookSecret(provided: string | null | undefined): boolean {
  const secret = configuredSecret();
  if (!secret) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;

  return timingSafeEqual(digest(secret), digest(provided));
}

let warned = false;

/**
 * Один раз за процесс сообщает, что секрет не задан. Вызывается при загрузке
 * роута, то есть при старте приложения.
 *
 * Зачем отдельная строка при старте: сам по себе fail-closed чинит дыру, но
 * превращает её в тихую поломку — Telegram получает 401 на каждый апдейт, а в
 * логе это выглядит как поток отказов без объяснения причины. Один заметный
 * маркер при старте отвечает на вопрос «почему бот молчит» сразу.
 *
 * Пишем в stderr: в логах контейнера Coolify видно `console.error`, а
 * `console.log` из серверного кода — нет.
 */
export function warnIfWebhookSecretMissing(): void {
  if (warned) return;
  warned = true;
  if (isWebhookSecretConfigured()) return;
  console.error(
    'WEBHOOK_SECRET_MISSING !!! TELEGRAM_WEBHOOK_SECRET не задан: вебхук отвечает 401 на все запросы, бот отвечать не будет. Задать переменную в окружении приложения.',
  );
}

/** Только для тестов: снимает отметку «уже предупреждали». */
export function __resetWebhookSecretWarning(): void {
  warned = false;
}
