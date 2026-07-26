import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Валидация и очистка данных, приходящих от анонимных посетителей: форма
 * на сайте и сообщения боту.
 *
 * Модуль серверный. `libphonenumber-js/min` тянется только в серверный
 * бандл — на вес клиентского кода это не влияет.
 */

// Лимиты живут отдельно: их использует и клиентская форма, которой этот
// модуль (вместе с libphonenumber-js) не нужен.
export { SITUATION_MIN, SITUATION_MAX } from '@/lib/limits';

/**
 * Управляющие C0/C1 и DEL, кроме табуляции (09) и перевода строки (0A).
 * Собираем через RegExp из строки: литеральные управляющие байты в исходнике
 * невидимы в диффах и ломаются при копировании файла.
 */
const CONTROL_CHARS = new RegExp('[\u0000-\u0008\u000B-\u001F\u007F-\u009F]', 'g');

/**
 * Невидимые символы, которыми в чате разворачивают текст задом наперёд или
 * прячут содержимое: bidi-переопределения, нулевой ширины пробелы, BOM.
 */
const INVISIBLE_CHARS = new RegExp(
  '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]',
  'g',
);

/**
 * Убирает то, что не должно попадать ни в сообщение, ни в лог.
 *
 * Переводы строк сохраняются: человек в кризисе пишет абзацами, и склеивать
 * его текст в одну строку — терять читаемость. Порядок важен: `\r\n` сводится
 * к `\n` ДО вырезания управляющих символов, иначе `\r` пропадёт вместе с
 * переносом и строки слипнутся.
 */
export function sanitizeText(input: string, maxLength: number): string {
  const cleaned = input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    // Больше двух пустых строк подряд читаемости не добавляют
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  // Обрезаем с пометкой: молча терять хвост обращения нельзя — команда должна
  // видеть, что текст был длиннее.
  return cleaned.slice(0, maxLength).trimEnd() + '… [обрезано]';
}

export type PhoneResult =
  { ok: true; e164: string } | { ok: false; reason: 'empty' | 'too_long' | 'invalid' };

/**
 * Приводит телефон к E.164 (`+79299922884`) — в таком виде номер в Telegram
 * становится кликабельным, и звонок делается в один тап.
 *
 * Принимаем и российские записи в любом виде (`8 929 992-28-84`,
 * `+7 (929) 992-28-84`, `9299922884`), и иностранные номера — клиент может
 * звонить из-за рубежа. Российская трактовка применяется только к записям,
 * которые ей однозначно соответствуют: 11 цифр с ведущей 8 или 7, либо
 * 10 цифр, начинающихся с 9. Остальное разбирается как международный номер;
 * угадывать страну по произвольному набору цифр — значит ошибаться в пользу
 * мусора вроде «99999999».
 */
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  // Длинную строку даже не разбираем: это не телефон, а попытка что-то передать.
  if (trimmed.length > 40) return { ok: false, reason: 'too_long' };

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'invalid' };

  let candidate: string;
  if (hasPlus) {
    candidate = `+${digits}`;
  } else if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    candidate = `+7${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith('9')) {
    // Мобильный без кода страны — самый частый ввод
    candidate = `+7${digits}`;
  } else {
    candidate = `+${digits}`;
  }

  const parsed = parsePhoneNumberFromString(candidate);
  if (!parsed || !parsed.isValid()) return { ok: false, reason: 'invalid' };
  return { ok: true, e164: parsed.number };
}
