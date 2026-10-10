import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRequests } from '../server/workspaces.mjs';
import { workspaceAccessKey } from '../shared/workspaceAccess.mjs';
const profile = (mode = 'read', workspace = 'design') => ({
  ID: 'profile',
  Spec: {
    Kind: 'codex',
    Metadata: {
      [workspaceAccessKey]: JSON.stringify({
        restricted: true,
        workspaces: [{ environment: 'env', workspace, mode }],
      }),
    },
  },
});
const session = {
  id: 'sid',
  spec: { EnvironmentID: 'env', workspace_id: 'design' },
  agents: [
    {
      id: 'member',
      spec: { Kind: 'codex', Sandbox: 'read-only', Metadata: { 'kites.profile': 'profile' } },
    },
  ],
};
function runtime(current, view = session) {
  return async (path) => Response.json(path.includes('/agents/') ? current : view);
}
test('service refuses a forged permissive profile clone and applies saved read-only grant', async () => {
  const prepare = workspaceRequests(runtime(profile()));
  const make = (workspace) => ({
    EnvironmentID: 'env',
    workspace_id: workspace,
    members: [
      {
        agent: {
          Kind: 'codex',
          Sandbox: 'danger-full-access',
          Metadata: { 'kites.profile': 'profile' },
        },
      },
    ],
  });
  await assert.rejects(prepare('/api/v1/sessions', 'POST', make('research')), { status: 403 });
  const accepted = await prepare('/api/v1/sessions', 'POST', make('design'));
  assert.equal(accepted.members[0].agent.Sandbox, 'read-only');
});
test('chat changes must obey every bot and use current grants', async () => {
  const prepare = workspaceRequests(runtime(profile('write', 'research')));
  await assert.rejects(prepare('/api/v1/sessions/sid/prompt', 'POST', { input: { text: 'go' } }), {
    status: 403,
  });
  const changed = await prepare('/api/v1/sessions/sid/workspace', 'PUT', {
    environment_id: 'env',
    workspace_id: 'research',
    sandboxes: { member: 'danger-full-access' },
  });
  assert.deepEqual(changed.sandboxes, { member: 'workspace-write' });
  const group = {
    ...session,
    agents: [
      ...session.agents,
      {
        id: 'second',
        spec: {
          Kind: 'codex',
          Metadata: { [workspaceAccessKey]: JSON.stringify({ restricted: true, workspaces: [] }) },
        },
      },
    ],
  };
  await assert.rejects(
    workspaceRequests(runtime(profile(), group))('/api/v1/sessions/sid/workspace', 'PUT', {
      environment_id: 'env',
      workspace_id: 'design',
    }),
    { status: 403 },
  );
});
test('permission downgrade blocks prompts until native sandbox is reapplied', async () => {
  const prepare = workspaceRequests(
    runtime(profile(), {
      ...session,
      agents: [
        { ...session.agents[0], spec: { ...session.agents[0].spec, Sandbox: 'workspace-write' } },
      ],
    }),
  );
  await assert.rejects(prepare('/api/v1/sessions/sid/prompt', 'POST', { input: { text: 'go' } }), {
    status: 409,
  });
});
test('new chat members get the agent env and default model of their Kind', async () => {
  const prepare = workspaceRequests(async () => Response.json({ Spec: { Kind: 'codex' } }), {
    codex: { BEDROCK_API_KEY: 'key', AGENTWAY_MODEL: 'gpt' },
  });
  const made = await prepare('/api/v1/sessions', 'POST', {
    members: [
      { agent: { Kind: 'codex' } },
      { agent: { Kind: 'codex', Model: 'mine', Env: { BEDROCK_API_KEY: 'own' } } },
      { agent: { Kind: 'claudecode' } },
    ],
  });
  assert.deepEqual(
    made.members.map(({ agent }) => agent),
    [
      { Kind: 'codex', Env: { BEDROCK_API_KEY: 'key' }, Model: 'gpt' },
      { Kind: 'codex', Model: 'mine', Env: { BEDROCK_API_KEY: 'own' } },
      { Kind: 'claudecode' },
    ],
  );
});
