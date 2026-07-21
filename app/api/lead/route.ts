import { NextRequest, NextResponse } from 'next/server';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { landings } from '@/content/landings';

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

const SITUATION_MIN = 10;
const SITUATION_MAX = 5000;
const PHONE_MAX = 32;
const N8N_TIMEOUT_MS = 5_000;

/** Известные источники: слаги посадочных плюс главная. */
const KNOWN_SOURCES = new Set([...Object.keys(landings), 'homepage']);

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

type Lead = {
  situation: string;
  phone: string;
  source: string;
  utm: Record<string, string>;
};

/**
 * Заявка, которую не удалось передать в n8n. Пишем в stdout с маркером
 * LEAD_FALLBACK (его видно в логах контейнера) и дублируем в файл.
 * Ошибку записи в файл гасим: потерять лог неприятно, но ответ клиенту
 * это ломать не должно.
 */
async function logFallback(lead: Lead, ip: string, reason: string) {
  const record = { ...lead, ip, reason, createdAt: new Date().toISOString() };
  console.error('LEAD_FALLBACK', JSON.stringify(record));

  const file = process.env.LEAD_FALLBACK_FILE || join(tmpdir(), 'lead-fallback.log');
  try {
    await appendFile(file, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error('LEAD_FALLBACK write failed:', err);
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

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

  const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
  const legacyMessage = typeof body.message === 'string' ? body.message.trim() : '';
  const text = situation || legacyMessage;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  // Источник — слаг посадочной или 'homepage'. Неизвестное значение не
  // пробрасываем, чтобы в n8n не приезжало произвольное содержимое запроса.
  const rawSource = typeof body.source === 'string' ? body.source.trim() : '';
  const source = KNOWN_SOURCES.has(rawSource) ? rawSource : 'unknown';

  if (!text || text.length < SITUATION_MIN || text.length > SITUATION_MAX) {
    return NextResponse.json(
      { ok: false, error: 'Опишите ситуацию подробнее (минимум 10 символов)' },
      { status: 400 },
    );
  }
  if (phone.length > PHONE_MAX) {
    return NextResponse.json({ ok: false, error: 'Некорректный телефон' }, { status: 400 });
  }

  const utm: Record<string, string> = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const [key, value] of Object.entries(body.utm)) {
      if (key.startsWith('utm_') && typeof value === 'string') {
        utm[key] = value.slice(0, 256);
      }
    }
  }

  const lead: Lead = { situation: text, phone, source, utm };

  // Дальше клиент в любом случае получает успех: заявка либо ушла в n8n,
  // либо легла в fallback-лог. Показывать посетителю в кризисе поломку
  // интеграции бессмысленно — он просто уйдёт к конкуренту.
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    await logFallback(lead, ip, 'N8N_WEBHOOK_URL is not configured');
    return NextResponse.json({ ok: true });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });

    if (!res.ok) {
      await logFallback(lead, ip, `n8n responded ${res.status}`);
    }
  } catch (err) {
    // Сюда же попадает таймаут: AbortSignal.timeout бросает TimeoutError.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
    await logFallback(lead, ip, reason);
  }

  // Ответ n8n клиенту не возвращаем: категория и срочность — для команды
  // в Telegram, посетителю это не показываем.
  return NextResponse.json({ ok: true });
}
