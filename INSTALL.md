# Discord Bot · Termux installation

```sh
pkg update && pkg upgrade -y
pkg install -y nodejs tmux unzip zip tar ffmpeg
mkdir -p ~/discord-bot
unzip /sdcard/Download/PUBLIC_DISCORD_BOT_FINAL.zip -d ~/discord-bot
cd ~/discord-bot
npm install
npm run check
npm run verify:termux
```

Create `.env` with your private Discord application values, then register commands in a test guild:

```sh
npm run deploy:commands
bash termux/start.sh
tmux attach -t discord-bot
```

To run the management dashboard, add the OAuth secret and callback registered in the Discord Developer Portal:

```dotenv
DISCORD_CLIENT_SECRET=replace-with-your-client-secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
DASHBOARD_PORT=3000
```

Then start it separately:

```sh
npm run dashboard
```

Open `http://localhost:3000/dashboard/`. Use HTTPS and a production callback URL when hosting it publicly.

For future source updates from GitHub:

```sh
cd ~/discord-bot
bash scripts/termux-github-update.sh
```

For global registration, use `npm run deploy:commands:global` only after the guild test passes. Keep Android battery optimisation disabled for Termux, allow background activity, and use the wake lock supplied by `termux/start.sh`.

The updater preserves `.env` and runtime state:

```sh
bash scripts/termux-update.sh /sdcard/Download/PUBLIC_DISCORD_BOT_FINAL.zip
npm run verify:termux
bash termux/start.sh
```
