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
};

export const games = data.games as Game[];

export function getGame(slug: string): Game | undefined {
  return games.find((g) => g.slug === slug);
}

/** Prefix a public/ path with the deploy base path (empty on Vercel). */
export function asset(path: string): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? '') + path;
}

/** The game's standalone page. Explicit index.html works on every static host. */
export function gameSrc(slug: string): string {
  return asset(`/games/${slug}/index.html`);
}

export function thumbBackground(g: Game): string {
  return `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})`;
}
