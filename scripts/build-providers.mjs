import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, 'bin'), { recursive: true });
for (const name of ['claude', 'codex', 'grok', 'goose']) {
  const source = readFileSync(join(root, 'scripts/providers', `${name}-kites`), 'utf8');
  writeFileSync(
    join(root, 'bin', `${name}-kites`),
    source.replace('#!/usr/bin/env node', `#!${process.execPath}`),
    { mode: 0o755 },
  );
}
