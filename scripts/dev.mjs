import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.once('exit', (code) => stop(code || 0));
  child.once('error', (error) => {
    console.error(error);
    stop(1);
  });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
