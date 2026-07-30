import { NextRequest, NextResponse } from 'next/server';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LANDING_SLUGS } from '@/content/landings';
import { sendTelegramMessage, formatLead, type LeadPayload } from '@/lib/telegram';
import { normalizePhone, sanitizeText, SITUATION_MIN, SITUATION_MAX } from '@/lib/validation';
import { summarizeLead } from '@/lib/lead-summary';

export const runtime = 'nodejs';

/**
 * Простой in-memory rate limit по IP.
 * Для одного инстанса standalone этого достаточно; при масштабировании
 * заменить на Redis/upstash.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

// Периодическая очистка, чтобы Map не рос бесконечно
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.windowStart > WINDOW_MS) hits.delete(ip);
  }
}, WINDOW_MS).unref?.();

/**
 * IP клиента за обратным прокси.
 *
 * `X-Forwarded-For` — это цепочка: каждый прокси ДОПИСЫВАЕТ адрес, от
 * которого получил запрос, в конец. Клиент может прислать заголовок сам, и
 * его значение окажется в начале — поэтому брать первый элемент нельзя:
 * проверка на проде показала, что с подставным `X-Forwarded-For` лимит
 * обходится с первого же запроса. Берём элемент, дописанный НАШИМ прокси, —
 * последний. Если прокси перед приложением несколько, число хопов задаётся
 * `TRUSTED_PROXY_HOPS`.
 */
function clientIp(req: NextRequest): string {
  const chain = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain.length > 0) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
    const index = Math.max(0, chain.length - hops);
    return chain[index];
  }

  // x-real-ip ставит сам прокси, подделать его снаружи нельзя.
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Известные источники: слаги посадочных плюс главная. */
const KNOWN_SOURCES = new Set([...LANDING_SLUGS, 'homepage']);

type LeadBody = {
  situation?: string;
  /** Старое имя поля — на случай, если у посетителя открыт прежний бандл. */
  message?: string;
  phone?: string;
  source?: string;
  utm?: Record<string, string>;
  honeypot?: string;
  /** Старое имя honeypot-поля, см. выше. */
  website?: string;
};

/** Форма заявки общая с `lib/telegram.ts`: там же живёт её формат для чата. */
type Lead = LeadPayload;

/**
 * Заявка, которую не удалось доставить в Telegram. Пишем в stdout с маркером
 * LEAD_FALLBACK (его видно в логах контейнера) и дублируем в файл.
 * Ошибку записи в файл гасим: потерять лог неприятно, но ответ клиенту
 * это ломать не должно.
 */
async function logFallback(lead: Lead, ip: string, reason: string) {
  const record = { ...lead, ip, reason, createdAt: new Date().toISOString() };
  // Отдельный заметный маркер: LEAD_FALLBACK легко потерять среди прочих
  // логов при разборе инцидента, а это ВСЕГДА означает, что заявка не
  // доехала до рабочей группы вживую — только в лог/файл.
  console.error(`LEAD_FORWARD_FAILED !!! заявка не доехала до рабочей группы: ${reason}`);
  console.error('LEAD_FALLBACK', JSON.stringify(record));

  const file = process.env.LEAD_FALLBACK_FILE || join(tmpdir(), 'lead-fallback.log');
  try {
    await appendFile(file, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error('LEAD_FALLBACK write failed:', err);
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'Слишком много запросов' }, { status: 429 });
  }

  let body: LeadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Некорректный запрос' }, { status: 400 });
  }

  // Honeypot: скрытое поле заполнено — это бот. Отвечаем 200, чтобы бот не
  // адаптировался, но дальше заявку не передаём и в fallback не пишем.
  if (body.honeypot || body.website) {
    return NextResponse.json({ ok: true });
  }

  // Текст чистим до проверки длины: управляющие символы и невидимки не должны
  // добирать длину до минимума и не должны уезжать ни в чат, ни в лог.
  const situation = typeof body.situation === 'string' ? body.situation : '';
  const legacyMessage = typeof body.message === 'string' ? body.message : '';
  const text = sanitizeText(situation || legacyMessage, SITUATION_MAX);
  const rawPhone = typeof body.phone === 'string' ? body.phone : '';

  // Источник — слаг посадочной или 'homepage'. Неизвестное значение не
  // пробрасываем, чтобы в чат не приезжало произвольное содержимое запроса.
  const rawSource = typeof body.source === 'string' ? body.source.trim() : '';
  const source = KNOWN_SOURCES.has(rawSource) ? rawSource : 'unknown';

  if (!text || text.length < SITUATION_MIN) {
    return NextResponse.json(
      { ok: false, error: `Опишите ситуацию подробнее (минимум ${SITUATION_MIN} символов)` },
      { status: 400 },
    );
  }

  // Телефон необязателен: без него связываемся другим способом. Но если он
  // указан — он должен быть телефоном, иначе заявка приходит с «99999999»,
  // и юрист тратит время на несуществующий номер.
  let phone = '';
  if (rawPhone.trim()) {
    const parsed = normalizePhone(rawPhone);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Проверьте номер телефона: нужен российский или международный номер, например +7 929 992-28-84',
        },
        { status: 400 },
      );
    }
    phone = parsed.e164;
  }

  const utm: Record<string, string> = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const [key, value] of Object.entries(body.utm)) {
      // Метки тоже уезжают в сообщение — чистим их так же, как текст.
      if (key.startsWith('utm_') && typeof value === 'string') {
        const clean = sanitizeText(value, 256).replace(/\n/g, ' ');
        if (clean) utm[key] = clean;
      }
    }
  }

  const lead: Lead = { situation: text, phone, source, utm };

  // Классификация ИИ — необязательное украшение карточки, не часть контракта
  // с клиентом: любой сбой (нет ключа, таймаут, ошибка, отказ модели) отдаёт
  // null, и заявка уходит как раньше, сырым текстом. Постфильтр стоп-паттернов
  // (как у бота) здесь не применяется — сводка идёт команде, не клиенту.
  const summary = await summarizeLead(text);
  if (summary) {
    lead.aiSummary = {
      directionLabel: summary.directionLabel,
      urgency: summary.urgency,
      summary: summary.summary,
    };
  }

  // Дальше клиент в любом случае получает успех: заявка либо ушла в Telegram,
  // либо легла в fallback-лог. Показывать посетителю в кризисе поломку
  // интеграции бессмысленно — он просто уйдёт к конкуренту.
  // critical: пересылка заявки в рабочую группу — потерянная пересылка это
  // потерянный лид, поэтому попыток больше и таймаут длиннее, чем у обычной
  // отправки (см. lib/telegram.ts).
  const result = await sendTelegramMessage(formatLead(lead, ip), { critical: true });
  if (!result.ok) {
    await logFallback(lead, ip, result.reason);
  }

  // Что именно ответил Telegram, клиенту не сообщаем: это внутренняя кухня,
  // посетителю показываем только «заявка принята».
  return NextResponse.json({ ok: true });
}
