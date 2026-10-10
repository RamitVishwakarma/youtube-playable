// Static export: `next build` writes a plain static site to out/, which any
// host can serve (Vercel, GitHub Pages, Netlify…). The games themselves are
// static files under public/games and are copied as-is.
//
// BASE_PATH lets the same site live under a sub-path, e.g. GitHub Pages
// project sites (BASE_PATH=/youtube-playable).
const basePath = process.env.BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
