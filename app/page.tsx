import Brand from '@/components/Brand';
import GameGrid from '@/components/GameGrid';
import { games } from '@/lib/games';

export default function Home() {
  return (
    <div className="wrap">
      <header className="top">
        <Brand />
        <nav>
          <a href="#games">Games</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <section className="hero">
        <h1>
          Ten tiny games. <span>Zero installs.</span>
        </h1>
        <p>
          Puzzles, physics, tycoon and arcade games built for YouTube Playables. Every one runs in your
          browser on phone or desktop, in portrait or landscape.
        </p>
        <div className="pills">
          <span className="pill"><b>{games.length}</b> games</span>
          <span className="pill">Under <b>50 KB</b> each</span>
          <span className="pill">Saves your progress</span>
          <span className="pill">No sign-up</span>
        </div>
      </section>

      <GameGrid games={games} />

      <section className="about" id="about">
        <div>
          <h4>Built for YouTube Playables</h4>
          <p>
            Each game uses the YouTube Playables SDK for cloud saves, pause/resume, audio settings, scores
            and ads, and ships to YouTube as a small self-contained bundle.
          </p>
        </div>
        <div>
          <h4>Same game, two homes</h4>
          <p>
            On YouTube the SDK handles saves and real ads. Here, progress is saved in your browser and ads
            are a short demo placeholder.
          </p>
        </div>
        <div>
          <h4>Fair rewarded ads</h4>
          <p>
            Ads are always optional: watch one for a hint, a revive or bonus coins. Interstitials only
            appear between levels.
          </p>
        </div>
      </section>
      <footer>Playables Arcade · original games, no tracking, no external assets.</footer>
    </div>
  );
}
