# Discord Bot

This is a public Discord bot for moderation, automod, levels, rank cards, reminders, events, giveaways, economy, music, tickets, forms, media, emoji tools, feeds and staff-controlled cross-server tunnels.

The active runtime contains no retired RPG command surface, private-only command gates, legacy artwork, forced fonts, forced headers, forced footers or forced private messages. Existing runtime state remains under `data/`; the safe Termux updater preserves `.env`, `data/`, `logs/`, `backups/` and `node_modules/`.

## Local checks

```sh
npm install
npm run check
npm run verify:offline
```

Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and optionally `DEPLOY_GUILD_ID`, `OWNER_ID`, `TENOR_API_KEY` or `GIPHY_API_KEY` in a private `.env` file. Custom card media is configured through permission-checked Discord commands; uploaded images are retained under `data/assets` and are never forced onto unrelated cards.

## Server dashboard

The project includes a real Discord OAuth dashboard for server administrators. It provides a server picker, permission-aware access, module overview, and persistent settings for onboarding, automod, levels, reminders, tickets, music, logs and server defaults.

Add `DISCORD_CLIENT_SECRET` and `DISCORD_REDIRECT_URI` to `.env`, register the redirect URI in the Discord Developer Portal, then run:

```sh
npm run dashboard
```

Open `http://localhost:3000/dashboard/`. The dashboard never receives the bot token in the browser. The documentation pages remain available at `http://localhost:3000/docs/`.

## GitHub-driven Termux updates

After the repository is merged to `main`, initialise or update a Termux checkout with:

```sh
cd ~/discord-bot
bash scripts/termux-github-update.sh
```

The updater uses fast-forward-only Git pulls, runs verification, and preserves `.env`, `data/`, `logs/`, `backups/` and `node_modules/`.
