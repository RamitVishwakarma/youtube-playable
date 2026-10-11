'use client';

import { useMemo, useRef, useState } from 'react';
import GameCard from '@/components/GameCard';
import { CATEGORIES, type Game } from '@/lib/games';

function Row({ title, items }: { title: string; items: Game[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="row">
      <div className="row-head">
        <h2>{title}</h2>
        <span className="row-count">{items.length}</span>
        <div className="row-nav">
          <button type="button" aria-label={'Scroll ' + title + ' left'} onClick={() => scroll(-1)}>‹</button>
          <button type="button" aria-label={'Scroll ' + title + ' right'} onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="row-track" ref={track}>
        {items.map((g) => (
          <GameCard key={g.slug} game={g} />
        ))}
      </div>
    </section>
  );
}

/** Search + category chips; rows by category, or a filtered grid. */
export default function Home({ games }: { games: Game[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const c = CATEGORIES.find((x) => x.id === cat);
    return games.filter((g) => (!c || c.test(g)) && (!needle || (g.title + ' ' + g.genre + ' ' + g.tagline).toLowerCase().includes(needle)));
  }, [games, q, cat]);
  const browsing = !q.trim() && cat === 'all';
  return (
    <>
      <div className="toolbar" id="games">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Search games" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search games" />
        </label>
        <div className="chips" role="tablist" aria-label="Categories">
          {[{ id: 'all', title: 'All' }, ...CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
              {c.title}
            </button>
          ))}
        </div>
      </div>
      {browsing ? (
        <>
          {CATEGORIES.map((c) => {
            const items = games.filter(c.test);
            return items.length ? <Row key={c.id} title={c.title} items={items} /> : null;
          })}
          <section className="row">
            <div className="row-head"><h2>All games</h2><span className="row-count">{games.length}</span></div>
            <main className="grid">{games.map((g) => <GameCard key={g.slug} game={g} />)}</main>
          </section>
        </>
      ) : (
        <section className="row">
          <div className="row-head"><h2>{filtered.length ? filtered.length + ' game' + (filtered.length === 1 ? '' : 's') : 'No games match'}</h2></div>
          <main className="grid">{filtered.map((g) => <GameCard key={g.slug} game={g} />)}</main>
        </section>
      )}
    </>
  );
}
