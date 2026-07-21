import type { Landing } from '@/content/landings';

/**
 * Вопросы с непустым ответом. Заготовки без текста ответа не должны попадать
 * ни в разметку, ни в JSON-LD: пустой `acceptedAnswer` — это невалидный
 * FAQPage, за такое Google снимает расширенный сниппет со всей страницы.
 * Отдельный модуль, чтобы клиентский FAQ не тянул в бандл schema.ts.
 */
export function answeredFaq(faq: Landing['faq']) {
  return faq.filter((item) => item.a.trim().length > 0);
}
