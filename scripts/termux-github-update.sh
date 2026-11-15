#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

PROJECT_DIR="${MYRIAD_GU_DIR:-$PWD}"
REPO_URL="${MYRIAD_GU_REPO_URL:-https://github.com/Lezixon/Myriad-Gu.git}"
BRANCH="${MYRIAD_GU_BRANCH:-main}"

if ! command -v git >/dev/null 2>&1; then
  echo "Git is required. Install it with: pkg install git"
  exit 1
fi

mkdir -p "$PROJECT_DIR"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
TEMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "Cloning $REPO_URL ($BRANCH) into $PROJECT_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR/repo"
  cp -a "$TEMP_DIR/repo/.git" "$PROJECT_DIR/.git"
  (
    cd "$TEMP_DIR/repo"
    tar --exclude=.git --exclude=.env --exclude=data --exclude=logs --exclude=backups --exclude=node_modules -cf - .
  ) | (
    cd "$PROJECT_DIR"
    tar -xf -
  )
else
  if [ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]; then
    echo "Tracked local changes detected. Commit or back them up before updating."
    exit 1
  fi
  git -C "$PROJECT_DIR" fetch origin "$BRANCH"
  git -C "$PROJECT_DIR" checkout "$BRANCH"
  git -C "$PROJECT_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$PROJECT_DIR"
npm install
npm run check
npm run verify:termux
echo "GitHub update complete. .env, data/, logs/ and backups/ were preserved."
