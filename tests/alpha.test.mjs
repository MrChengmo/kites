import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alphaConnection, defaultAlphaURL } from '../server/alpha.mjs';

test('alpha connection uses the cloud alpha and the default key file', () => {
  const home = mkdtempSync(join(tmpdir(), 'kites-alpha-'));
  try {
    assert.deepEqual(alphaConnection({}, home), {
      alphaURL: defaultAlphaURL,
      alphaToken: undefined,
      alphaAgentEnv: {},
    });
    mkdirSync(join(home, '.agentway-alpha'));
    writeFileSync(join(home, '.agentway-alpha', 'kites.cred'), 'v4.public.default\n');
    assert.deepEqual(alphaConnection({}, home), {
      alphaURL: 'https://agentway-alpha.dev.medo.dev',
      alphaToken: 'v4.public.default',
      alphaAgentEnv: {},
    });
    assert.equal(
      alphaConnection({ AGENTWAY_ALPHA_TOKEN: 'v4.public.env' }, home).alphaToken,
      'v4.public.env',
    );
    writeFileSync(join(home, 'other.cred'), 'v4.public.file\n');
    assert.deepEqual(
      alphaConnection(
        {
          AGENTWAY_ALPHA_URL: 'https://127.0.0.1:8081',
          AGENTWAY_ALPHA_TOKEN_FILE: join(home, 'other.cred'),
          AGENTWAY_ALPHA_TOKEN: 'v4.public.env',
        },
        home,
      ),
      { alphaURL: 'https://127.0.0.1:8081', alphaToken: 'v4.public.file', alphaAgentEnv: {} },
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('alpha agent env reads one file per agent Kind', () => {
  const home = mkdtempSync(join(tmpdir(), 'kites-alpha-'));
  try {
    assert.deepEqual(alphaConnection({}, home).alphaAgentEnv, {});
    const dir = join(home, '.agentway-alpha', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'codex.env'),
      '# comment\nexport BEDROCK_API_KEY="key"\nEMPTY=\nAGENTWAY_MODEL=gpt\n',
    );
    writeFileSync(join(dir, 'notes.txt'), 'A=1\n');
    assert.deepEqual(alphaConnection({}, home).alphaAgentEnv, {
      codex: { BEDROCK_API_KEY: 'key', AGENTWAY_MODEL: 'gpt' },
    });
    const other = join(home, 'other');
    mkdirSync(other);
    writeFileSync(join(other, 'claudecode.env'), "ANTHROPIC_MODEL='glm'\n");
    assert.deepEqual(alphaConnection({ AGENTWAY_ALPHA_AGENT_ENV_DIR: other }, home).alphaAgentEnv, {
      claudecode: { ANTHROPIC_MODEL: 'glm' },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
