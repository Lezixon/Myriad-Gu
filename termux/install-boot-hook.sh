#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
mkdir -p "$HOME/.termux/boot"
# An explicit opt-in: Termux:Boot must also be installed and launched once.
printf '#!/data/data/com.termux/files/usr/bin/bash\ntermux-wake-lock\ncd %q || exit 1\nexec bash termux/start.sh\n' "$PWD" > "$HOME/.termux/boot/99-discord-bot.sh"
chmod 700 "$HOME/.termux/boot/99-discord-bot.sh"
echo 'Boot script installed. Install/open Termux:Boot to enable startup after reboot.'
