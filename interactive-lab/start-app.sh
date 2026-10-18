#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
exec node --env-file-if-exists=.env server.mjs
