#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
log='logs/maintenance.log'
rotate() {
  [[ ! -f "$log" ]] || mv -f "$log" logs/maintenance.1.log
}
[[ ! -f "$log" || $(stat -c %s "$log" 2>/dev/null || echo 0) -lt 5242880 ]] || rotate
while true; do
  printf '[%s] Maintenance check\n' "$(date -u '+%FT%TZ')" >> "$log"
  node --env-file-if-exists=.env scripts/verify-public.mjs --termux >> "$log" 2>&1 || :
  [[ $(stat -c %s "$log" 2>/dev/null || echo 0) -lt 5242880 ]] || rotate
  sleep 900
done
