import type { Metadata } from 'next';
import NotFoundScreen from '@/components/NotFoundScreen';

/**
 * Корневая 404: всё, что не совпало ни с одним роутом, — многосегментные
 * адреса вроде `/wp-content/uploads/x.php` и мусор от сканеров.
 *
 * Без этого файла Next отдавал свою служебную страницу «404 This page could
 * not be found» — белый фон, английский текст и ни одной ссылки: человек с
 * битой ссылки уходил насовсем.
 */
export const metadata: Metadata = {
  title: 'Страница не найдена — Митрагост',
  // Индексировать нечего: статус 404 и так это говорит, но директива снимает
  // вопрос для роботов, которые ходят по устаревшим ссылкам из выдачи.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
