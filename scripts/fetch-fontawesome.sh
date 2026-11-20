#!/usr/bin/env bash
# Fetches Font Awesome Free (same version the site used from cdnjs) into vendor/fontawesome/.
# npm verifies the package tarball against the registry's integrity hash.
set -euo pipefail
VERSION="6.0.0"

cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

( cd "$tmp" && npm pack "@fortawesome/fontawesome-free@${VERSION}" --silent >/dev/null )
tar -xzf "$tmp"/fortawesome-fontawesome-free-${VERSION}.tgz -C "$tmp"

rm -rf vendor/fontawesome
mkdir -p vendor/fontawesome/css vendor/fontawesome/webfonts
cp "$tmp/package/css/all.min.css" vendor/fontawesome/css/
cp "$tmp"/package/webfonts/*.woff2 "$tmp"/package/webfonts/*.ttf vendor/fontawesome/webfonts/
cp "$tmp/package/LICENSE.txt" vendor/fontawesome/LICENSE.txt

echo "Font Awesome Free ${VERSION} → vendor/fontawesome/"
du -sh vendor/fontawesome
