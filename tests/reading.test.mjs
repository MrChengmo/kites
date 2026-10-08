import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readingItems, readingSummary } from '../shared/reading.mjs';
import { createReading } from '../server/reading.mjs';
import { openStore } from '../server/store.mjs';
const event = (seq, type, extra = {}) => ({
  seq,
  event_id: `e${seq}`,
  created_at: '2026-10-07T08:00:00Z',
  agent_id: 'bot',
  payload: { type, content: 'Hello', ...extra },
});
const tape = [
  event(1, 'user/message', { prompt: 'Start' }),
  event(2, 'text', { partial: true }),
  event(3, 'tool_use'),
  event(4, 'thinking'),
  event(5, 'text'),
  event(6, 'ask', { requestId: 'q', awaitingReply: true, title: 'Choose a workspace' }),
  event(7, 'ask', { requestId: 'q', awaitingReply: true }),
  event(8, 'status'),
];
test('unread ignores deltas, execution events, user messages, and duplicate questions', () => {
  assert.deepEqual(
    readingItems(tape).map((item) => item.seq),
    [1, 5, 6],
  );
  assert.equal(readingSummary(tape).unread, 2);
  assert.equal(readingSummary(tape, 5).firstUnreadSeq, 6);
  assert.equal(readingSummary(tape, 6).unread, 0);
  assert.equal(readingSummary(tape).preview, 'Choose a workspace');
});
test('read position survives restart, never moves backwards, and incremental history catches up', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'kites-reading-'));
  let store = openStore(join(folder, 'state.db'));
  const requested = [];
  const runtime = async (path) => {
    const from = Number(new URL(path, 'http://localhost').searchParams.get('from_seq'));
    requested.push(from);
    return Response.json({ events: tape.filter((item) => item.seq > from) });
  };
  try {
    let reading = createReading(store, runtime);
    assert.equal((await reading.get(['chat'])).chat.unread, 2);
    await reading.mark('chat', 5);
    assert.equal((await reading.mark('chat', 1)).readSeq, 5);
    await assert.rejects(() => reading.mark('chat', 999), /exceeds/);
    await assert.rejects(() => reading.mark('chat', -1), /non-negative/);
    assert.ok(requested.includes(8));
    store.close();
    store = openStore(join(folder, 'state.db'));
    reading = createReading(store, runtime);
    assert.equal((await reading.get(['chat'])).chat.readSeq, 5);
    tape.push(event(9, 'text', { content: 'New reply' }));
    assert.equal((await reading.get(['chat'])).chat.unread, 2);
    await Promise.all([reading.mark('chat', 9), reading.mark('chat', 5)]);
    assert.equal((await reading.get(['chat'])).chat.unread, 0);
  } finally {
    store.close();
    rmSync(folder, { recursive: true });
  }
});
