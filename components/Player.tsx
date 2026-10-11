'use client';

import Link from 'next/link';
import { useRef } from 'react';
import Brand from '@/components/Brand';
import GameCard from '@/components/GameCard';
import { type Game, gameSrc, playsWide } from '@/lib/games';

/**
 * The game gets the stage: 3D games fill it edge to edge (any aspect), the
 * portrait 2D games sit in a phone frame. Up to four related games sit in a
 * slim column beside it when the screen has room.
 */
export default function Player({ game, related }: { game: Game; related: Game[] }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const wide = playsWide(game);
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.current?.requestFullscreen?.().catch(() => {});
  }
  return (
    <div className="play-page">
      <div className="bar">
        <Link className="back" href="/" aria-label="All games">
          ←
        </Link>
        <h1 id="title">{game.title}</h1>
        <span className="bar-genre">{game.genre}</span>
        <span className="bar-brand"><Brand /></span>
        <button type="button" className="fs" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen">
          ⛶
        </button>
      </div>
      <div className={'stage' + (wide ? ' wide' : '')}>
        <div className={'frame' + (wide ? ' wide' : ' phone')} ref={frame}>
          <iframe
            ref={iframe}
            id="game"
            title={game.title}
            src={gameSrc(game.slug)}
            allow="autoplay; fullscreen"
            onLoad={() => iframe.current?.contentWindow?.focus()}
          />
        </div>
        <aside className="more" aria-label="More games like this">
          <h2>More like this</h2>
          {related.map((g) => (
            <GameCard key={g.slug} game={g} compact />
          ))}
        </aside>
      </div>
    </div>
  );
}
