import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container section" style={{ textAlign: 'center' }}>
      <h1>Страница не найдена</h1>
      <p className="muted" style={{ marginTop: '1rem' }}>
        Такой посадочной страницы не существует.
      </p>
      <p style={{ marginTop: '2rem' }}>
        <Link href="/">На главную</Link>
      </p>
    </main>
  );
}
