'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type Game, thumbBackground, thumbSrc } from '@/lib/games';

const FILTERS: Record<string, (g: Game) => boolean> = {
  All: () => true,
  '3D': (g) => g.badge === '3D',
  Puzzle: (g) => /puzzle|riddle|sort/i.test(g.genre),
  Physics: (g) => /physics|ragdoll|merge/i.test(g.genre),
  Arcade: (g) => /arcade|racing|runner|sports/i.test(g.genre),
  Chill: (g) => /tycoon|fashion|simulation/i.test(g.genre),
};
const KEY = 'portal:filter';

export default function GameGrid({ games }: { games: Game[] }) {
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && FILTERS[saved]) setFilter(saved);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);

  function choose(name: string) {
    setFilter(name);
    try {
      localStorage.setItem(KEY, name);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="filters" role="tablist" aria-label="Filter games">
        {Object.keys(FILTERS).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === filter}
            className={name === filter ? 'on' : ''}
            onClick={() => choose(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <main className="grid" id="games">
        {games.filter(FILTERS[filter]).map((g) => (
          <Link key={g.slug} className="card" href={`/play/${g.slug}/`}>
            <div className="thumb" style={{ background: thumbBackground(g) }}>
              <img src={thumbSrc(g.slug)} alt={g.title + ' gameplay'} loading="lazy" width={480} height={640} />
              <span className="genre">{g.genre}</span>
              {g.badge && <span className="badge">{g.badge}</span>}
            </div>
            <div className="body">
              <h3>{g.title}</h3>
              <p>{g.tagline}</p>
            </div>
          </Link>
        ))}
      </main>
    </>
  );
}
