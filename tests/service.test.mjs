import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKites } from '../server/app.mjs';
import { nextOccurrence, openStore, validateRoutine } from '../server/store.mjs';
import { createScheduler } from '../server/scheduler.mjs';
const routine = {
  id: 'routine-1',
  name: 'Briefing',
  agentId: 'agent-1',
  prompt: 'Summarize the day',
  schedule: 'daily',
  time: '09:00',
  timezone: 'Asia/Shanghai',
  minutes: 60,
  enabled: true,
};

test('schedule uses local zone and skips weekends', () => {
  const after = Date.parse('2026-10-02T02:00:00Z');
  assert.equal(
    new Date(nextOccurrence({ ...routine, schedule: 'weekdays' }, after)).toISOString(),
    '2026-10-05T01:00:00.000Z',
  );
});
test('schedule skips missing DST time and repeated wall clock time', () => {
  const r = { ...routine, timezone: 'America/New_York', time: '02:30' };
  assert.equal(
    new Date(nextOccurrence(r, Date.parse('2026-03-08T05:00:00Z'))).toISOString(),
    '2026-03-09T06:30:00.000Z',
  );
  assert.equal(
    new Date(
      nextOccurrence({ ...r, time: '01:30' }, Date.parse('2026-11-01T05:31:00Z')),
    ).toISOString(),
    '2026-11-02T06:30:00.000Z',
  );
});
test('schedule rejects invalid zones and unsafe intervals', () => {
  assert.throws(() => validateRoutine({ ...routine, timezone: 'bad-zone' }));
  assert.throws(() => validateRoutine({ ...routine, schedule: 'interval', minutes: 0 }));
});
test('durable storage retains records and claims each occurrence once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kites-test-'));
  let store = openStore(join(dir, 'db'));
  store.put('routines', routine);
  const run = { id: 'r1', routineId: routine.id, occurrence: 'one', status: 'running' };
  assert.equal(store.claim(run), true);
  assert.equal(store.claim({ ...run, id: 'r2' }), false);
  store.close();
  store = openStore(join(dir, 'db'));
  assert.equal(store.get('routines', routine.id).name, 'Briefing');
  assert.equal(store.runs().length, 1);
  store.close();
  rmSync(dir, { recursive: true });
});
test('service enforces auth/origin, proxies streaming, and stores routine runs', async () => {
  let accepted = 0;
  const requests = [];
  const upstream = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    requests.push({ path: req.url, data: data ? JSON.parse(data) : undefined });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/sessions' && req.method === 'POST')
      return res.end(JSON.stringify({ id: 'sid-test', agents: [] }));
    if (req.url === '/api/v1/sessions/sid-test' && req.method === 'GET')
      return res.end(JSON.stringify({ id: 'sid-test', spec: {}, agents: [] }));
    if (req.url.endsWith('/prompt')) {
      accepted++;
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(
        JSON.stringify({
          event_id: 'e1',
          payload: { type: 'text', content: 'Done', partial: false },
        }) + '\n',
      );
      return res.end(
        JSON.stringify({ event_id: 'e2', payload: { type: 'status', status: 'idle' } }) + '\n',
      );
    }
    return res.end(
      JSON.stringify({ ID: 'agent-1', Spec: { ID: 'agent-1', Kind: 'codex' }, status: 'ok' }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const app = createKites({
    runtimeURL: `http://127.0.0.1:${upstream.address().port}`,
    database: ':memory:',
    accessToken: 'test-key',
  });
  const addr = await app.listen(0);
  const root = `http://127.0.0.1:${addr.port}`;
  const call = (path, init = {}) =>
    fetch(root + path, {
      ...init,
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  try {
    assert.equal((await fetch(root + '/api/kites/state')).status, 401);
    assert.equal(
      (await call('/api/kites/state', { headers: { Origin: 'https://evil.example' } })).status,
      403,
    );
    const native = await call('/api/kites/state', { headers: { Origin: 'capacitor://localhost' } });
    assert.equal(native.status, 200);
    assert.equal(native.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal((await call('/api/v1/health')).status, 200);
    assert.equal((await call('/api/v1/secrets')).status, 404);
    assert.equal(
      (await call('/api/v1/environments/env/workspaces/ws/archive', { method: 'POST', body: '{}' }))
        .status,
      200,
    );
    assert.ok(requests.some((r) => r.path === '/api/v1/environments/env/workspaces/ws/archive'));
    assert.equal(
      (
        await call('/api/v1/environments/env/workspaces/ws/delete-files', {
          method: 'POST',
          body: '{}',
        })
      ).status,
      404,
    );
    const response = await call('/api/v1/sessions/sid-test/prompt', {
      method: 'POST',
      body: JSON.stringify({ input: { text: 'hello' } }),
    });
    assert.match(await response.text(), /Done/);
    const created = await call('/api/kites/routines', {
      method: 'POST',
      body: JSON.stringify(routine),
    });
    assert.equal(created.status, 200);
    const saved = await created.json();
    assert.equal(
      (await call(`/api/kites/routines/${saved.id}/run`, { method: 'POST', body: '{}' })).status,
      202,
    );
    for (let i = 0; i < 50 && app.store.runs()[0]?.status === 'running'; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(app.store.runs()[0].status, 'completed');
    assert.equal(app.store.runs()[0].sessionId, 'sid-test');
    assert.equal(accepted, 2);
    assert.deepEqual(requests.find((r) => r.path === '/api/v1/sessions').data.members, [
      { agent: { Kind: 'codex', Metadata: { 'kites.profile': 'agent-1' } } },
    ]);
    assert.equal(
      (
        await call('/api/kites/files', {
          method: 'POST',
          body: JSON.stringify({ name: 'Answer.md', content: 'Useful work' }),
        })
      ).status,
      200,
    );
    assert.equal((await (await call('/api/kites/state')).json()).files[0].content, 'Useful work');
  } finally {
    await app.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
test('scheduler preserves interrupted turns and refuses duplicate dispatch', async () => {
  const store = openStore(':memory:');
  store.claim({ id: 'old', routineId: 'a', occurrence: 'old', status: 'running' });
  let sends = 0;
  const scheduler = createScheduler({
    store,
    runtime: async (path) => {
      if (path.includes('/agents/'))
        return Response.json({ ID: 'agent-1', Spec: { Kind: 'codex' } });
      sends++;
      if (path.endsWith('/prompt'))
        return new Response('{"payload":{"type":"status","status":"idle"}}\n');
      return Response.json({ id: 's' });
    },
  });
  assert.equal(store.runs()[0].status, 'interrupted');
  assert.ok(scheduler.start(routine, 'once'));
  assert.throws(() => scheduler.start(routine, 'once'), /already running/);
  for (let i = 0; i < 20 && store.runs()[0].status === 'running'; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(scheduler.start(routine, 'once'), undefined);
  assert.equal(sends, 2);
  await scheduler.close();
  store.close();
});

test('alpha connection isolates product state and retains authentication checks', async () => {
  const local = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ source: 'local' }));
  });
  const alpha = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ source: 'alpha' }));
  });
  await new Promise((resolve) => local.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => alpha.listen(0, '127.0.0.1', resolve));
  const app = createKites({
    runtimeURL: `http://127.0.0.1:${local.address().port}`,
    alphaURL: `http://127.0.0.1:${alpha.address().port}`,
    database: ':memory:',
    alphaDatabase: ':memory:',
    accessToken: 'test-key',
  });
  const address = await app.listen(0);
  const root = `http://127.0.0.1:${address.port}`;
  const call = (path, data) =>
    fetch(root + path, {
      method: data ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
  try {
    assert.equal((await fetch(root + '/alpha/api/kites/state')).status, 401);
    assert.equal((await (await call('/api/v1/health')).json()).source, 'local');
    assert.equal((await (await call('/alpha/api/v1/health')).json()).source, 'alpha');
    await call('/alpha/api/kites/chats', { id: 's', title: 'Cloud test', avatar: '{}' });
    assert.equal((await (await call('/alpha/api/kites/state')).json()).chats.length, 1);
    assert.equal((await (await call('/api/kites/state')).json()).chats.length, 0);
  } finally {
    await app.close();
    await new Promise((resolve) => local.close(resolve));
    await new Promise((resolve) => alpha.close(resolve));
  }
});
