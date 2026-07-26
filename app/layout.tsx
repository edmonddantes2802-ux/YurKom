import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { SITE_URL } from '@/lib/site';
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
  // Без базы относительные пути в og:image остаются относительными, и соцсети
  // их не разворачивают. Берётся из того же источника, что канонические ссылки.
  metadataBase: new URL(SITE_URL),
  title: 'Митрагост — антикризисная юридическая защита бизнеса',
  description: 'Экстренная юридическая помощь бизнесу и частным лицам.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Страницы задают свой openGraph целиком, а twitter не переопределяют —
  // карточка наследуется отсюда на весь сайт.
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#0e0f12',
  colorScheme: 'dark',
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
