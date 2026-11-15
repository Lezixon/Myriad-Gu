import { existsSync } from 'node:fs';

const required = [
  'public/site/index.html',
  'public/site/commands.html',
  'public/site/customisation.html',
  'public/site/getting-started.html',
  'public/site/status.html',
  'public/site/faq.html',
  'public/site/site.css'
];

const missing = required.filter(file => !existsSync(file));
if (missing.length) {
  console.error(`Missing public-site files: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Public site check passed (${required.length} files).`);
