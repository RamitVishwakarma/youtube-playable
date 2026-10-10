'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { type Game, gameSrc, thumbBackground, thumbSrc } from '@/lib/games';

/**
 * The game, and nothing in its way. Help lives inside each game (its "?"
 * button). On screens with room beside the game, other games show as cards.
 */
export default function Player({ game, others }: { game: Game; others: Game[] }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  return (
    <div className="play-page">
      <div className="bar">
        <Link className="back" href="/" aria-label="All games">
          ←
        </Link>
        <h1 id="title">{game.title}</h1>
      </div>
      <div className="stage">
        <div className="frame phone">
          <iframe
            ref={iframe}
            id="game"
            title={game.title}
            src={gameSrc(game.slug)}
            allow="autoplay; fullscreen"
            onLoad={() => iframe.current?.contentWindow?.focus()}
          />
        </div>
        <aside className="more" aria-label="Other games">
          {others.map((g) => (
            <Link key={g.slug} className="mcard" href={`/play/${g.slug}/`}>
              <span className="mthumb" style={{ background: thumbBackground(g) }}>
                <img src={thumbSrc(g.slug)} alt="" loading="lazy" width={480} height={640} />
                {g.badge && <i>{g.badge}</i>}
              </span>
              <b>{g.title}</b>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
