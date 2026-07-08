#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCK_PATH = join(__dirname, '.skill-lock.json');

let lock;
try {
  lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
} catch (err) {
  console.error(`Failed to read ${LOCK_PATH}: ${err.message}`);
  process.exit(1);
}

const skills = lock?.skills;
if (!skills || typeof skills !== 'object' || Object.keys(skills).length === 0) {
  console.error('No skills found in .skill-lock.json');
  process.exit(1);
}

// Group skills by source (+ ref) so we call `npx skills add` once per repo/branch.
const groups = new Map();
for (const [name, entry] of Object.entries(skills)) {
  const source = entry.source || entry.sourceUrl;
  if (!source) {
    console.warn(`Skipping "${name}": no source`);
    continue;
  }
  const installSource = entry.ref ? `${source}#${entry.ref}` : source;
  if (!groups.has(installSource)) {
    groups.set(installSource, []);
  }
  groups.get(installSource).push(name);
}

let failed = 0;
for (const [installSource, skillNames] of groups) {
  // Install only to the universal .agents/skills directory.
  // This avoids the "does not support global skill installation" errors from
  // agents that do not have a global skills dir.
  const args = ['skills', 'add', installSource, '-g', '-y', '-a', 'universal'];
  for (const name of skillNames) {
    args.push('-s', name);
  }

  console.log(`\n$ npx ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  const result = spawnSync('npx', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nFailed to install from ${installSource}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} source group(s) failed.`);
  process.exit(1);
}

console.log('\nDone.');
