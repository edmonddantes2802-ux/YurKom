import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import Metrika from '@/components/Metrika';
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
        <Metrika />
      </body>
    </html>
  );
}
