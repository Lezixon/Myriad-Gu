#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
# Installed Termux:Boot hook should launch the project that supplied this script.
cd "$(dirname "$0")/.."
exec bash termux/start.sh
