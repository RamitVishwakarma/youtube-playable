#!/usr/bin/env bash
# Rebuilds public/shared/vendor/three.min.js: three.js plus the few add-ons the
# 3D games use, bundled into one minified ES module (no CDN, so the YouTube
# bundles make no network calls).
set -euo pipefail
VERSION="${1:-0.186.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
cd "$WORK"
npm init -y >/dev/null
npm install --silent "three@$VERSION" esbuild@0.28.2
cat > entry.js <<'JS'
export * from 'three';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
JS
npx esbuild entry.js --bundle --minify --format=esm --legal-comments=none \
  --banner:js="/* three.js r${VERSION#0.} (MIT License, Copyright 2010-2026 three.js authors) + RoundedBoxGeometry, mergeGeometries. Bundled with esbuild: see scripts/vendor-three.sh */" \
  --outfile="$ROOT/public/shared/vendor/three.min.js"
cp node_modules/three/LICENSE "$ROOT/public/shared/vendor/THREE-LICENSE.txt"
rm -rf "$WORK"
