// Prints one version's section of CHANGELOG.md, for the release notes (requirements SH-2, SH-14).
// Usage: node scripts/changelog-section.mjs 0.8.0
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/changelog-section.mjs <version>');
  process.exit(2);
}

const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = text.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((l) => l.startsWith('## ['));
process.stdout.write([lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n').trimEnd() + '\n');
