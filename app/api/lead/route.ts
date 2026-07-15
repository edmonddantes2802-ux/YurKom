import { NextRequest, NextResponse } from 'next/server';

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

type LeadBody = {
  message?: string;
  phone?: string;
  slug?: string;
  utm?: Record<string, string>;
  website?: string; // honeypot
};

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

  // Honeypot: скрытое поле заполнено — это бот. Отвечаем 200, чтобы бот не адаптировался.
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

  if (!message || message.length < 10 || message.length > 5000) {
    return NextResponse.json(
      { ok: false, error: 'Опишите ситуацию подробнее (минимум 10 символов)' },
      { status: 400 },
    );
  }
  if (phone.length > 32) {
    return NextResponse.json({ ok: false, error: 'Некорректный телефон' }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('N8N_WEBHOOK_URL is not configured');
    return NextResponse.json(
      { ok: false, error: 'Сервис временно недоступен' },
      { status: 503 },
    );
  }

  const utm: Record<string, string> = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const [key, value] of Object.entries(body.utm)) {
      if (key.startsWith('utm_') && typeof value === 'string') {
        utm[key] = value.slice(0, 256);
      }
    }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        phone,
        slug,
        utm,
        ip,
        createdAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`n8n webhook responded ${res.status}`);
      return NextResponse.json(
        { ok: false, error: 'Не удалось отправить заявку, попробуйте позже' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('n8n webhook error:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось отправить заявку, попробуйте позже' },
      { status: 502 },
    );
  }
}
