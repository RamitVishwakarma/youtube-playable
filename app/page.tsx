import Brand from '@/components/Brand';
import Hero from '@/components/Hero';
import Home from '@/components/Home';
import { games } from '@/lib/games';

export default function Page() {
  const picks = games.filter((g) => g.badge === '3D').slice(0, 5);
  return (
    <div className="site">
      <header className="top">
        <div className="wrap top-in">
          <Brand />
          <nav>
            <a href="#games">Games</a>
            <a href="#about">About</a>
          </nav>
        </div>
      </header>
      <div className="wrap">
        <Hero picks={picks} />
        <Home games={games} />
        <section className="about" id="about">
          <div>
            <h4>Built for YouTube Playables</h4>
            <p>
              Every game uses the YouTube Playables SDK for cloud saves, pause and resume, audio settings, scores and
              ads, and ships to YouTube as a small self-contained bundle.
            </p>
          </div>
          <div>
            <h4>Phone, tablet or desktop</h4>
            <p>
              The 3D games fill any screen, portrait or landscape. Touch, mouse and keyboard all work, and each game has
              a <b>?</b> button that explains how to play.
            </p>
          </div>
          <div>
            <h4>Fair, optional ads</h4>
            <p>
              Ads are always your choice: watch one for a revive, a boost or bonus coins. Here on the website they are a
              short demo placeholder.
            </p>
          </div>
        </section>
        <footer>
          <span>Playables Arcade</span> · {games.length} original games · no sign-up, no tracking
        </footer>
      </div>
    </div>
  );
}
