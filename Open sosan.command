#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if [[ -x .venv/bin/python ]]; then
  exec .venv/bin/python server.py
fi
exec python3 server.py
