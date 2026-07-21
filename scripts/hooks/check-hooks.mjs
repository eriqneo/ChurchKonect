import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../pb_hooks/', import.meta.url);
const files = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.pb.js'))
  .map((entry) => join(root.pathname, entry.name))
  .sort();

if (!files.length) {
  console.log('No PocketBase hook files found.');
  process.exit(0);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`PocketBase hook syntax check passed for ${files.length} file${files.length === 1 ? '' : 's'}.`);
