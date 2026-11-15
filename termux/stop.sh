#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
if command -v tmux >/dev/null; then
  tmux has-session -t discord-bot 2>/dev/null && tmux kill-session -t discord-bot || :
fi
if command -v termux-wake-unlock >/dev/null; then termux-wake-unlock; fi
echo 'Discord Bot tmux session stopped.'
