import { existsSync } from 'node:fs';
import { slashCommands } from '../src/index.js';

const checks = ['package.json', 'src/index.js', 'src/publicbot/store.js', 'src/publicbot/cards.js', 'termux/start.sh', 'termux/run-forever.sh'];
const missing = checks.filter(file => !existsSync(file));
if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
console.log(`Discord Bot doctor: ${slashCommands.length} grouped roots, ${checks.length} core files present.`);
