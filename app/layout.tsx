import type { Metadata } from 'next';
import Script from 'next/script';
// TODO: заменить на next/font/local, когда появятся файлы лицензированных шрифтов в /fonts.
// Сейчас — Google-пара serif+grotesque с кириллицей, скачивается на этапе билда (self-hosted).
import { Playfair_Display, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const heading = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-body',
  display: 'swap',
});

// Утилитарная моногарнитура: метки, надзаголовки, числовые данные, телефон.
const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono-face',
  display: 'swap',
});

const METRIKA_ID = process.env.NEXT_PUBLIC_METRIKA_ID;

export const metadata: Metadata = {
  title: 'Юридическая антикризисная служба',
  description: 'Экстренная юридическая помощь бизнесу и частным лицам.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${heading.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        {METRIKA_ID && (
          <>
            <Script id="yandex-metrika" strategy="afterInteractive">
              {`
                (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],
                k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
                (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
                ym(${Number(METRIKA_ID)}, "init", {
                  clickmap: true,
                  trackLinks: true,
                  accurateTrackBounce: true,
                  webvisor: false
                });
              `}
            </Script>
            <noscript>
              <div>
                <img
                  src={`https://mc.yandex.ru/watch/${Number(METRIKA_ID)}`}
                  style={{ position: 'absolute', left: '-9999px' }}
                  alt=""
                />
              </div>
            </noscript>
          </>
        )}
      </body>
    </html>
  );
}
