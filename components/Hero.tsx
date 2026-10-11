'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type Game, thumbSrc, wideSrc } from '@/lib/games';

/** Rotating spotlight of featured games with a wide gameplay shot. */
export default function Hero({ picks }: { picks: Game[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || picks.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % picks.length), 6000);
    return () => clearInterval(t);
  }, [hold, picks.length]);
  const g = picks[i];
  return (
    <section className="hero" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} aria-label="Featured games">
      {picks.map((p, k) => (
        <img key={p.slug} className={'hero-bg' + (k === i ? ' on' : '')} src={wideSrc(p.slug)} alt="" aria-hidden="true" />
      ))}
      <div className="hero-shade" />
      <div className="hero-body">
        <span className="hero-kicker">{g.badge === '3D' ? 'New in 3D' : 'Featured'} · {g.genre}</span>
        <h1>{g.title}</h1>
        <p>{g.tagline}</p>
        <div className="hero-cta">
          <Link className="btn-play" href={`/play/${g.slug}/`}>
            ▶ Play now
          </Link>
          <span className="hero-note">Free · no install · saves progress</span>
        </div>
        <div className="hero-dots" role="tablist">
          {picks.map((p, k) => (
            <button key={p.slug} type="button" role="tab" aria-selected={k === i} aria-label={p.title} className={k === i ? 'on' : ''} onClick={() => setI(k)} />
          ))}
        </div>
      </div>
      <Link className="hero-phone" href={`/play/${g.slug}/`} aria-label={'Play ' + g.title}>
        <img src={thumbSrc(g.slug)} alt="" />
      </Link>
    </section>
  );
}
