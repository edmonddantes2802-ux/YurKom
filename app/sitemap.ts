import type { MetadataRoute } from 'next';
import { landings } from '@/content/landings';
import { SITE_URL } from '@/lib/site';

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
