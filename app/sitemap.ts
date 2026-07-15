import type { MetadataRoute } from 'next';
import { landings } from '@/content/landings';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now },
    ...Object.keys(landings).map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified: now,
    })),
  ];
}
