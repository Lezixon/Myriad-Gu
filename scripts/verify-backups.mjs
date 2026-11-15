// Read-only local recovery audit. Never print saved state, tokens, or member data.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backupDir = resolve(process.env.DATA_DIR || './data', 'backups');
if (!existsSync(backupDir)) {
  console.log('No backup directory exists yet; nothing to verify.');
  process.exit(0);
}

const files = readdirSync(backupDir).filter(name => name.endsWith('.json')).sort();
const rows = files.map(name => {
  const issues = [];
  try {
    const value = JSON.parse(readFileSync(resolve(backupDir, name), 'utf8'));
    if (!value || typeof value !== 'object' || !value.publicBot || typeof value.publicBot !== 'object') {
      issues.push('missing publicBot state');
    }
  } catch {
    issues.push('invalid JSON');
  }
  return { name, ok: issues.length === 0, issues };
});

for (const row of rows) {
  console.log(`${row.ok ? 'OK' : 'ERROR'} ${row.name}${row.issues.length ? `: ${row.issues.join('; ')}` : ''}`);
}
console.log(`${rows.length} backup(s) checked.`);
if (rows.some(row => !row.ok)) process.exitCode = 1;
