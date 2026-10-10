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

export function thumbBackground(g: Game): string {
  return `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})`;
}
