#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
LOG_FILE="${DISCORD_BOT_LOG_FILE:-logs/discord-bot.log}"
if command -v termux-wake-lock >/dev/null 2>&1; then termux-wake-lock >/dev/null 2>&1 || :; fi
mkdir -p "${DATA_DIR:-./data}" logs
if ! command -v node >/dev/null; then echo 'Node is missing; install nodejs in Termux.' >&2; exit 1; fi
if ! node -e 'const [m,n,p]=process.versions.node.split(".").map(Number);process.exit(m>24||(m===24&&(n>17||(n===17&&p>=0)))?0:1)' ; then echo 'Node.js 24.17+ required.' >&2; exit 1; fi
if [[ ! -f .env ]]; then echo 'Missing .env: configure a private token before starting.' >&2; exit 1; fi
rotate_logs() {
  for n in 3 2 1; do [[ ! -f "${LOG_FILE%.log}.$n.log" ]] || mv -f "${LOG_FILE%.log}.$n.log" "${LOG_FILE%.log}.$((n+1)).log"; done
  if [[ -f "$LOG_FILE" ]]; then mv -f "$LOG_FILE" "${LOG_FILE%.log}.1.log"; fi
}
if [[ -f "$LOG_FILE" ]]; then rotate_logs; fi
child=''
cleanup() {
  trap - INT TERM HUP EXIT
  if command -v termux-wake-unlock >/dev/null 2>&1; then termux-wake-unlock >/dev/null 2>&1 || :; fi
  if [[ -n "$child" ]]; then kill "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
  exit 0
}
trap cleanup INT TERM HUP EXIT
failures=0
while true; do
  if [[ -f "$LOG_FILE" ]] && [[ $(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0) -ge 20971520 ]]; then rotate_logs; fi
  echo "[$(date -u '+%FT%TZ')] Starting Discord Bot" | tee -a "$LOG_FILE"
  started=$(date +%s)
  node src/index.js >> "$LOG_FILE" 2>&1 & child=$!
  if wait "$child"; then status=0; else status=$?; fi
  child=''
  elapsed=$(( $(date +%s) - started ))
  # Reset the crash counter only after a genuinely healthy run.
  if (( elapsed >= 600 )); then failures=0; fi
  failures=$((failures+1))
  if (( failures >= 6 )); then
    echo "[$(date -u '+%FT%TZ')] Discord Bot stopped after 6 unstable exits; check $LOG_FILE before restarting." | tee -a "$LOG_FILE"
    exit 1
  fi
  delay=$((15 * (2 ** (failures-1))))
  if (( delay > 300 )); then delay=300; fi
  echo "[$(date -u '+%FT%TZ')] Exited with status $status after ${elapsed}s; retry ${failures}/5 in ${delay}s" | tee -a "$LOG_FILE"
  sleep "$delay" & child=$!
  wait "$child" || :
  child=''
done
