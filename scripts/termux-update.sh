#!/usr/bin/env bash
main(){
# Public Discord Bot cumulative update with source rollback. Never print .env values.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ZIP="${1:-}"
BACKUP=''
STAGE=''

message(){ printf '%s\n' "$*" >&2; }
fail(){ message "Discord Bot update stopped: $1" "Backup: ${BACKUP:-not created}"; exit 1; }
cleanup(){ if [[ -n "$STAGE" && -d "$STAGE" ]]; then rm -rf -- "$STAGE"; fi; }
trap cleanup EXIT

# Source is every top-level file/folder except these live/private paths.
# Run only in the confirmed project root; restore removes newly introduced files too.
clear_source(){
  local entry name
  shopt -s dotglob nullglob
  for entry in "$ROOT"/*; do
    name="${entry##*/}"
    case "$name" in .env|data|node_modules|logs|backups) continue ;; esac
    rm -rf -- "$entry" || return 1
  done
  shopt -u dotglob nullglob
}
manual_instructions(){
  message "MANUAL RESTORE — source archive: $BACKUP/source.tar" \
    "Run the following commands in Termux (private .env and data/ are preserved):" \
    "  cd '$ROOT'" \
    "  BACKUP='$BACKUP'" \
    "  [ -f \"\$BACKUP/source.tar\" ] || { echo 'Backup missing'; exit 1; }" \
    "  bash termux/stop.sh || true" \
    "  shopt -s dotglob nullglob" \
    "  for path in '$ROOT'/*; do" \
    "    case \"\${path##*/}\" in .env|data|node_modules|logs|backups) continue ;; esac" \
    "    rm -rf -- \"\$path\"" \
    "  done" \
    "  shopt -u dotglob nullglob" \
    "  tar -xf \"\$BACKUP/source.tar\" -C '$ROOT'" \
    "  npm install && npm run check && npm run verify:termux && bash termux/start.sh"
}

rollback(){
  local reason="$1"
  message "DISCORD BOT UPDATE FAILED: $reason. Restoring previous source..."
  if ! clear_source || ! tar -xf "$BACKUP/source.tar" -C "$ROOT"; then
    message "CRITICAL: SOURCE RESTORE FAILED. Discord Bot remains stopped. Backup: $BACKUP"
    manual_instructions
    exit 1
  fi
  # Dependencies may have been replaced by npm install. Do not restart without repairing them.
  if ! (cd "$ROOT" && npm install); then
    message "CRITICAL: Previous source restored, but dependency reinstall failed. Discord Bot remains stopped. Backup: $BACKUP"
    manual_instructions
    exit 1
  fi
  if ! (cd "$ROOT" && bash termux/start.sh); then
    message "Previous source and dependencies restored, but restarting the old version FAILED. Backup: $BACKUP"
    manual_instructions
    exit 1
  fi
  message "UPDATE FAILED ($reason). OLD VERSION RESTORED AND RESTARTED. Backup: $BACKUP"
  exit 1
}

[[ -n "$ZIP" ]] || fail 'Usage: bash scripts/termux-update.sh /sdcard/Download/PUBLIC_DISCORD_BOT_FINAL.zip'
[[ -f "$ZIP" ]] || fail "ZIP not found: $ZIP"
for cmd in tar unzip node npm tee grep; do command -v "$cmd" >/dev/null || fail "Required tool missing: $cmd"; done
[[ -f "$ROOT/package.json" && -f "$ROOT/termux/stop.sh" && -f "$ROOT/termux/start.sh" ]] || fail 'Run from an existing Discord Bot installation'
cd "$ROOT"
BACKUP="$HOME/discord-bot-backups/update-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$BACKUP" || fail 'Cannot create backup folder'
# Stop first: never take a changing source/data snapshot of a running bot.
bash termux/stop.sh || fail 'Could not stop Discord Bot; no source files changed'
[[ ! -f .env ]] || cp -p .env "$BACKUP/.env" || fail 'Could not back up .env'
[[ ! -d data ]] || cp -a data "$BACKUP/data" || fail 'Could not back up data'
# Snapshot ALL existing source (including dotfiles), with explicit private/runtime exclusions.
if ! tar -cf "$BACKUP/source.tar" --exclude='./.env' --exclude='./data' --exclude='./node_modules' --exclude='./logs' --exclude='./backups' -C "$ROOT" .; then
  fail 'Cannot back up original source; update not applied'
fi
[[ -s "$BACKUP/source.tar" ]] || fail 'Source backup is empty; update not applied'
message "Private data and previous source backed up: $BACKUP"

STAGE="$(mktemp -d "$HOME/discord-bot-stage.XXXXXXXX")" || fail 'Cannot create staging directory'
# Archive validation occurs BEFORE changing live source.
unzip -Z1 "$ZIP" > "$STAGE/entries" || fail 'Invalid or unreadable ZIP'
if grep -Eq '(^/|(^|/)\.\.(/|$)|^[A-Za-z]:)' "$STAGE/entries"; then fail 'Unsafe archive paths'; fi
# Only the archive root's live data/ directory is private runtime state.
if grep -Eiq '(^|/)(\.env|node_modules|logs|backups)(/|$)|^data(/|$)' "$STAGE/entries"; then
  fail 'Archive contains private/runtime files; refusing update'
fi
unzip -q "$ZIP" -d "$STAGE/content" || fail 'ZIP extraction failed'
if find "$STAGE/content" -type l | grep -q .; then fail 'Archive contains symlinks; refusing update'; fi
[[ -f "$STAGE/content/package.json" && -f "$STAGE/content/src/index.js" ]] || fail 'Expected root-layout ZIP (missing package.json or src/index.js)'

# From this point onward, ANY update/copy/check failure invokes rollback.
cp -a "$STAGE/content/." "$ROOT/" || rollback 'copying update files failed'
message 'New source copied. Installing and checking...'
(cd "$ROOT" && npm install) || rollback 'npm install failed'
(cd "$ROOT" && npm run check) || rollback 'npm run check failed'
VERIFY_LOG="$BACKUP/verify-termux.log"
if ! (cd "$ROOT" && npm run verify:termux 2>&1 | tee "$VERIFY_LOG"); then
  message "Verification failed. Important lines from $VERIFY_LOG:"
  grep -Ei '(^|[^A-Z])(FAIL|ERROR|not installed|required|missing)([^A-Z]|$)' "$VERIFY_LOG" | tail -n 40 >&2 || tail -n 40 "$VERIFY_LOG" >&2
  rollback 'npm run verify:termux failed; see verify-termux.log in the backup folder'
fi
message 'All checks passed. Starting updated Discord Bot...'
(cd "$ROOT" && bash termux/start.sh) || rollback 'starting updated version failed'
message "Update successful. Previous source and private-data backup: $BACKUP"
}
main "$@"; exit $?
