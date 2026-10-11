import data from './games.json';

export type Game = {
  slug: string;
  title: string;
  icon: string;
  genre: string;
  tagline: string;
  how: string;
  rewarded: string[];
  colors: [string, string];
  featured?: boolean;
  /** Short corner badge on the portal card, e.g. "3D". */
  badge?: string;
};

export const games = data.games as Game[];

export function getGame(slug: string): Game | undefined {
  return games.find((g) => g.slug === slug);
}

/** Prefix a public/ path with the deploy base path (empty on Vercel). */
export function asset(path: string): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? '') + path;
}

/**
 * The game's standalone page. Use the folder URL: Vercel serves
 * games/<slug>/index.html only at /games/<slug>/ and 404s the literal
 * /games/<slug>/index.html path.
 */
export function gameSrc(slug: string): string {
  return asset(`/games/${slug}/`);
}

/** Portrait gameplay screenshot used on cards (public/thumbs/<slug>.webp, 3:4). */
export function thumbSrc(slug: string): string {
  return asset(`/thumbs/${slug}.webp`);
}

/** Wide gameplay screenshot for banners (public/thumbs/wide/<slug>.webp, 16:9). */
export function wideSrc(slug: string): string {
  return asset(`/thumbs/wide/${slug}.webp`);
}

export function thumbBackground(g: Game): string {
  return `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})`;
}

/**
 * 3D games are built for any aspect ratio, so the player gives them the
 * whole stage; the 2D canvas games are portrait and play in a phone frame.
 */
export function playsWide(g: Game): boolean {
  return g.badge === '3D';
}

export type Category = { id: string; title: string; test: (g: Game) => boolean };
export const CATEGORIES: Category[] = [
  { id: '3d', title: '3D games', test: (g) => g.badge === '3D' },
  { id: 'puzzle', title: 'Puzzle', test: (g) => /puzzle|riddle|sort/i.test(g.genre) },
  { id: 'arcade', title: 'Arcade & sports', test: (g) => /arcade|racing|runner|sports|arena/i.test(g.genre) },
  { id: 'chill', title: 'Tycoon & chill', test: (g) => /tycoon|fashion|simulation|idle/i.test(g.genre) },
  { id: 'physics', title: 'Physics', test: (g) => /physics|ragdoll|merge|draw/i.test(g.genre) },
];

const words = (g: Game) => new Set(g.genre.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && w !== '3d'));

/** Up to n games that share the most with this one (category, genre words). */
export function related(game: Game, n = 4): Game[] {
  const mine = words(game);
  const cats = CATEGORIES.filter((c) => c.test(game));
  const score = (g: Game) => {
    let s = 0;
    for (const c of cats) if (c.test(g)) s += 3;
    for (const w of words(g)) if (mine.has(w)) s += 2;
    if (g.featured) s += 1;
    return s;
  };
  return games
    .filter((g) => g.slug !== game.slug)
    .map((g, i) => ({ g, s: score(g), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.g);
}
