#!/usr/bin/env bash
# Fetches the ONNX Runtime Web files the AI decoder needs into vendor/ort/.
# npm verifies the package tarball against the registry's integrity hash.
set -euo pipefail
VERSION="1.24.3"
FILES=(ort.wasm.min.js ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm)

cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

( cd "$tmp" && npm pack "onnxruntime-web@${VERSION}" --silent >/dev/null )
tar -xzf "$tmp/onnxruntime-web-${VERSION}.tgz" -C "$tmp"

mkdir -p vendor/ort
for f in "${FILES[@]}"; do
  cp "$tmp/package/dist/$f" "vendor/ort/$f"
done
cp "$tmp/package/README.md" vendor/ort/README.md 2>/dev/null || true
printf "onnxruntime-web %s (MIT License, Copyright (c) Microsoft Corporation)\nhttps://github.com/microsoft/onnxruntime\n" "$VERSION" > vendor/ort/VERSION

echo "onnxruntime-web ${VERSION} → vendor/ort/"
( cd vendor/ort && sha256sum "${FILES[@]}" )
