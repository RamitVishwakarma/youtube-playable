import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Player from '@/components/Player';
import { games, getGame, related } from '@/lib/games';

export const dynamicParams = false;

export function generateStaticParams() {
  return games.map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = getGame((await params).slug);
  return game ? { title: game.title, description: game.tagline } : {};
}

export default async function PlayPage({ params }: Props) {
  const game = getGame((await params).slug);
  if (!game) notFound();
  return <Player game={game} related={related(game, 4)} />;
}
