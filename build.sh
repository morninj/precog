#!/bin/bash
set -e

VERSION=$(grep '"version"' src/manifest.json | sed 's/.*: "\(.*\)".*/\1/')
OUTFILE="releases/precog-v${VERSION}.zip"

mkdir -p releases

if [ -f "$OUTFILE" ]; then
  echo "Release $OUTFILE already exists. Bump version in manifest.json first."
  exit 1
fi

cd src
zip -r "../$OUTFILE" . -x '*.DS_Store'
cd ..

echo "Built $OUTFILE"
