import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap notfound">
      <h1>Game not found</h1>
      <p>
        <Link href="/">Back to all games</Link>
      </p>
    </div>
  );
}
