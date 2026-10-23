#!/bin/sh
set -eu
# Host must already be configured in ~/.ssh/config, with a trusted host key.
# Keep stdin/stdout intact: they carry MCP, not an interactive shell.
exec /usr/bin/ssh -T -o BatchMode=yes -o ConnectTimeout=15 \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -o ControlMaster=no -o ControlPath=none \
  "${CELLAR_SSH_HOST:-Styx}" \
  'exec sh "$HOME/Workspace/cellar-tools/v2/scripts/run-notion-mcp.sh"'
