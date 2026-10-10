import Link from 'next/link';

export default function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="logo" aria-hidden="true" />
      Playables Arcade
    </Link>
  );
}
