#!/bin/bash
set -euo pipefail
set -x

__dirname="$(CDPATH= cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

display_usage() {
    npm run electron-builder -- --help
}

if [ $# -le 1 ]; then
    display_usage
    exit 1
fi

if [[ ( $# == "--help") ||  $# == "-h" ]]; then
    display_usage
    exit 0
fi

echo "Installing production dependencies and rebuilding native modules for Electron..."
"$__dirname/../node_modules/.bin/electron-builder" install-app-deps

cross-env USE_HARD_LINKS=false npm run electron-builder -- "$@"
