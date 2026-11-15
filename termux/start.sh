#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
if [[ -f data/state.json ]]; then
  echo 'Using existing Discord Bot data/state.json; saved reminders, schedules, XP and settings are preserved.'
else
  echo 'No existing data/state.json found; Discord Bot will create a new state file.'
fi
if command -v termux-wake-lock >/dev/null; then termux-wake-lock; fi
if ! command -v tmux >/dev/null; then echo 'Install tmux: pkg install tmux'; exit 1; fi
if tmux has-session -t discord-bot 2>/dev/null; then echo 'Discord Bot session already exists; attach with tmux attach -t discord-bot'; exit 0; fi
tmux new-session -d -s discord-bot "bash '$PWD/termux/run-forever.sh'"
tmux new-window -d -t discord-bot -n maintenance "bash '$PWD/termux/maintenance-loop.sh'"
echo 'Started Discord Bot in tmux. Attach: tmux attach -t discord-bot'
