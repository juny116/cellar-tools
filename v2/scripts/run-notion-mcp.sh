#!/bin/sh
# No credentials on stdout or the command line; load the private env only on this host.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export CELLAR_BACKEND=notion
export CELLAR_NOTION_CONFIG="${CELLAR_NOTION_CONFIG:-$ROOT/.data/notion.json}"
export CELLAR_JOURNAL="${CELLAR_JOURNAL:-$ROOT/.data/notion-journal.sqlite}"
CELLAR_ENV_FILE="${CELLAR_ENV_FILE:-$ROOT/../cellar-logger/.env}"
exec "${CELLAR_NODE:-node}" --env-file="$CELLAR_ENV_FILE" "$ROOT/v2/mcp-server.mjs"
