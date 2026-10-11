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
          </nav>
        </div>
      </header>
      <div className="wrap">
        <Hero picks={picks} />
        <Home games={games} />
        <footer>
          <span>Playables Arcade</span> · {games.length} original games
        </footer>
      </div>
    </div>
  );
}
