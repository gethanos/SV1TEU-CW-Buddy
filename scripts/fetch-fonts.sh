#!/usr/bin/env bash
# Fetches the UI fonts (Inter, JetBrains Mono; SIL OFL 1.1) into vendor/fonts/.
# Latin subset, woff2 only. npm verifies each tarball against the registry's integrity hash.
set -euo pipefail
VERSION="5.3.0"

cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rm -rf vendor/fonts
mkdir -p vendor/fonts
for pkg in inter jetbrains-mono; do
  ( cd "$tmp" && npm pack "@fontsource/${pkg}@${VERSION}" --silent >/dev/null )
  mkdir -p "$tmp/$pkg"
  tar -xzf "$tmp/fontsource-${pkg}-${VERSION}.tgz" -C "$tmp/$pkg"
  cp "$tmp/$pkg/package/LICENSE" "vendor/fonts/LICENSE-${pkg}.txt"
done
for w in 400 500 600 700; do cp "$tmp/inter/package/files/inter-latin-${w}-normal.woff2" vendor/fonts/; done
for w in 400 500 700; do cp "$tmp/jetbrains-mono/package/files/jetbrains-mono-latin-${w}-normal.woff2" vendor/fonts/; done

echo "Fonts (@fontsource ${VERSION}) → vendor/fonts/"
du -sh vendor/fonts
