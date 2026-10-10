import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The shared cloud alpha. It has a public certificate, so it needs only an API key.
export const defaultAlphaURL = 'https://agentway-alpha.dev.medo.dev';

// Token order: AGENTWAY_ALPHA_TOKEN_FILE, AGENTWAY_ALPHA_TOKEN, then ~/.agentway-alpha/kites.cred.
// Agent env: one <Kind>.env file per agent Kind in AGENTWAY_ALPHA_AGENT_ENV_DIR,
// default ~/.agentway-alpha/agents.
export function alphaConnection(env = process.env, home = homedir()) {
  const defaultFile = join(home, '.agentway-alpha', 'kites.cred');
  const file =
    env.AGENTWAY_ALPHA_TOKEN_FILE ||
    (!env.AGENTWAY_ALPHA_TOKEN && existsSync(defaultFile) ? defaultFile : '');
  return {
    alphaURL: env.AGENTWAY_ALPHA_URL || defaultAlphaURL,
    alphaToken: file ? readFileSync(file, 'utf8').trim() : env.AGENTWAY_ALPHA_TOKEN,
    alphaAgentEnv: agentEnv(
      env.AGENTWAY_ALPHA_AGENT_ENV_DIR || join(home, '.agentway-alpha', 'agents'),
    ),
  };
}

// agentEnv reads codex.env, claudecode.env, ... into { codex: {KEY: value}, ... }.
export function agentEnv(dir) {
  if (!existsSync(dir)) return {};
  const kinds = {};
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.env'))
      kinds[name.slice(0, -'.env'.length)] = parseEnv(readFileSync(join(dir, name), 'utf8'));
  }
  return kinds;
}

// parseEnv reads KEY=value lines. It skips comments and empty values.
export function parseEnv(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) vars[match[1]] = value;
  }
  return vars;
}
