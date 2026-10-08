import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKites } from '../server/app.mjs';
test('archive survives restart and details edits, restore and metadata deletion persist', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kites-chat-actions-'));
  const database = join(directory, 'state.db');
  let app = createKites({ database });
  async function start() {
    await app.listen(0);
    return `http://127.0.0.1:${app.server.address().port}`;
  }
  let url = await start();
  const write = async (value) => {
    const response = await fetch(`${url}/api/kites/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    await write({ id: 'chat', title: 'Bob', archived: true, pinned: true, avatar: 'custom' });
    await app.close();
    app = createKites({ database });
    url = await start();
    const state = await (await fetch(`${url}/api/kites/state`)).json();
    assert.equal(state.chats[0].archived, true);
    assert.equal(
      (await write({ ...state.chats[0], title: 'Renamed', archived: undefined })).archived,
      true,
    );
    assert.equal((await write({ ...state.chats[0], archived: false })).archived, false);
    assert.equal((await fetch(`${url}/api/kites/chats/chat`, { method: 'DELETE' })).status, 200);
    assert.deepEqual((await (await fetch(`${url}/api/kites/state`)).json()).chats, []);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true });
  }
});
