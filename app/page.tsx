import Link from 'next/link';
import { landings } from '@/content/landings';

export default function Home() {
  return (
    <main className="container section">
      <h1>Юридическая антикризисная служба</h1>
      <p className="muted" style={{ marginTop: '1rem', maxWidth: '36em' }}>
        Главная страница — заглушка. Посадочные страницы:
      </p>
      <ul style={{ marginTop: '2rem', listStyle: 'none' }}>
        {Object.values(landings).map((l) => (
          <li key={l.slug} style={{ marginBottom: '0.5rem' }}>
            <Link href={`/${l.slug}`}>{l.h1}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
