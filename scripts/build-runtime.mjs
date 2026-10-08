import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const source = process.env.AGENTWAY_SOURCE;
if (!source) {
  console.error('Set AGENTWAY_SOURCE to the Agentway runtime directory.');
  process.exit(1);
}
mkdirSync('bin', { recursive: true });
const result = spawnSync(
  'go',
  [
    'build',
    '-o',
    resolve('bin', process.platform === 'win32' ? 'agentwayd.exe' : 'agentwayd'),
    './cmd/agentwayd',
  ],
  { cwd: source, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
