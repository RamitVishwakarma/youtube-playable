import Link from 'next/link';
import { type Game, thumbBackground, thumbSrc } from '@/lib/games';

/** Portrait card: gameplay screenshot, title, one-line pitch. */
export default function GameCard({ game, compact = false }: { game: Game; compact?: boolean }) {
  return (
    <Link className={'gcard' + (compact ? ' compact' : '')} href={`/play/${game.slug}/`}>
      <span className="gthumb" style={{ background: thumbBackground(game) }}>
        <img src={thumbSrc(game.slug)} alt={game.title + ' gameplay'} loading="lazy" width={480} height={640} />
        {game.badge && <span className="badge">{game.badge}</span>}
        <span className="playhint" aria-hidden="true">▶</span>
      </span>
      <span className="gmeta">
        <b>{game.title}</b>
        {!compact && <small>{game.tagline}</small>}
        <i>{game.genre}</i>
      </span>
    </Link>
  );
}
