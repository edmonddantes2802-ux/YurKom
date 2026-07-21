/**
 * Базовый URL сайта — единая точка правды для sitemap, robots, канонических
 * ссылок и JSON-LD. Фолбэк указывает на боевой домен, поэтому даже сборка
 * без заданной env даёт корректные абсолютные адреса, а не example.com.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitragost.ru';
