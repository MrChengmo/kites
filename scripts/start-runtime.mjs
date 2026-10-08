import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const settingsPath = process.env.KITES_PROVIDER_CONFIG || resolve(root, 'data/providers.json');
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
const child = spawn(
  resolve(root, 'bin', process.platform === 'win32' ? 'agentwayd.exe' : 'agentwayd'),
  [
    '--listen',
    '127.0.0.1:8080',
    '--home',
    resolve(root, 'data/runtime'),
    '--store',
    'sqlite',
    '--cwd',
    root,
  ],
  { cwd: root, env: { ...settings, ...process.env }, stdio: 'inherit' },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
