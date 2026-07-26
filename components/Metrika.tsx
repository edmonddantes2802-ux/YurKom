import { Suspense } from 'react';
import Script from 'next/script';
import MetrikaRouteHits from '@/components/MetrikaRouteHits';

/**
 * Яндекс.Метрика. Серверный компонент намеренно: инициализация должна попасть
 * в HTML статической страницы. Клиентский компонент с `useSearchParams` при
 * статическом рендере отдаёт fallback, и счётчик в разметке не появляется —
 * подключался бы только после гидрации, а `<noscript>`-пиксель терялся вовсе.
 *
 * ID — только из NEXT_PUBLIC_METRIKA_ID (переменная должна быть отмечена
 * Available at Buildtime, иначе инлайнится пустая строка и счётчик молча
 * отключается). Не задан — не рендерим ничего.
 *
 * На localhost счётчик не стартует. Страницы статические, хост клиента на
 * этапе сборки неизвестен, поэтому проверка живёт внутри инлайн-скрипта и
 * выполняется уже в браузере: разметка одинакова для прода и дева, гидрация
 * не расходится.
 */
const METRIKA_ID = Number(process.env.NEXT_PUBLIC_METRIKA_ID) || 0;

export default function Metrika() {
  if (!METRIKA_ID) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){
            var h = location.hostname;
            if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\\.localhost$/.test(h)) return;
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],
            k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
            m[i](${METRIKA_ID}, "init", {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              // Записи сессий нужны для разбора юзабилити на старте.
              // Поля формы закрыты классом ym-disable-keys (components/Qualifier.tsx):
              // ситуация и телефон — персональные данные, их Вебвизор не пишет.
              // Добавляя новые поля ввода, вешать этот класс на них тоже.
              webvisor: true
            });
          })
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        `}
      </Script>

      {/* useSearchParams требует границы Suspense, иначе статический рендер
          страницы срывается в динамический. */}
      <Suspense fallback={null}>
        <MetrikaRouteHits />
      </Suspense>

      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
