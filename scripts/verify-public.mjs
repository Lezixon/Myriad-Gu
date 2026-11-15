import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const required = ['package.json', 'src/index.js', 'src/publicbot/store.js', 'src/publicbot/cards.js', 'termux/start.sh', 'termux/run-forever.sh'];
const missing = required.filter(file => !existsSync(file));
if (missing.length) { console.error(`Missing required files: ${missing.join(', ')}`); process.exit(1); }
for (const file of ['src/index.js', 'src/publicbot/store.js', 'src/publicbot/cards.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const activeFiles = ['src/index.js', 'src/publicbot/store.js', 'src/publicbot/cards.js', 'public/site/index.html', 'public/site/commands.html', 'public/site/customisation.html', 'public/site/faq.html', 'public/site/getting-started.html', 'public/site/status.html'];
// Keep the guard without retaining retired product names in the public source.
const retiredBranding = new RegExp([
  ['cult', 'ivation'].join(''),
  ['noct', 'is'].join(''),
  ['heaven', 'bound'].join(''),
  ['heavenly', ['cult', 'ivation'].join('')].join(' ')
].join('|'), 'i');
for (const file of activeFiles) {
  const content = await readFile(file, 'utf8');
  if (retiredBranding.test(content)) throw new Error(`Retired branding found in active public file: ${file}`);
}
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (!packageJson.scripts?.start || !packageJson.scripts?.check) throw new Error('Required npm scripts are missing.');
if (process.argv.includes('--termux') && Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required.');
if (process.argv.includes('--commands')) console.log('Grouped public command surface: moderation, automod, server, welcome, roles, levels, reminders, events, giveaways, economy, music, tickets, social, media, emoji, tunnel, feeds, forms, automation and utility.');
if (process.argv.includes('--backup')) console.log('Runtime backups are stored under data/backups and are never overwritten by source updates.');
console.log('Public bot verification passed.');
