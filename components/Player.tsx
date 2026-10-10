'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { type Game, gameSrc, thumbBackground } from '@/lib/games';

const PHONE_KEY = 'portal:phone';

export default function Player({ game, others }: { game: Game; others: Game[] }) {
  const [phone, setPhone] = useState(true);
  const [run, setRun] = useState(0); // bump to reload the game
  const frame = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    try {
      setPhone(localStorage.getItem(PHONE_KEY) !== '0');
    } catch {
      /* keep default */
    }
  }, []);

  function toggleFrame() {
    const next = !phone;
    setPhone(next);
    try {
      localStorage.setItem(PHONE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.current?.requestFullscreen?.().catch(() => {});
  }

  return (
    <div className="play-page">
      <div className="bar">
        <Link className="back" href="/">
          ← All games
        </Link>
        <h1 id="title">
          {game.icon} {game.title}
        </h1>
        <button type="button" className="hide-sm" onClick={toggleFrame} title="Switch between phone frame and full width">
          {phone ? '🖥️ Wide' : '📱 Phone'}
        </button>
        <button type="button" onClick={() => setRun((r) => r + 1)} title="Restart the game">
          ↻ Reload
        </button>
        <button type="button" onClick={fullscreen} title="Fullscreen">
          ⛶
        </button>
      </div>
      <div className="stage">
        <div className={'frame' + (phone ? ' phone' : '')} ref={frame}>
          <iframe
            key={run}
            ref={iframe}
            id="game"
            title={game.title}
            src={gameSrc(game.slug)}
            allow="autoplay; fullscreen"
            onLoad={() => iframe.current?.contentWindow?.focus()}
          />
        </div>
        <aside className="side">
          <div className="box">
            <h3>How to play</h3>
            <p>{game.how}</p>
          </div>
          <div className="box">
            <h3>Optional rewarded ads</h3>
            <ul>
              {game.rewarded.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div className="box">
            <h3>More games</h3>
            {others.map((g) => (
              <Link key={g.slug} className="mini" href={`/play/${g.slug}/`}>
                <span style={{ background: thumbBackground(g) }}>{g.icon}</span>
                <b>{g.title}</b>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
