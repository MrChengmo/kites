import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, createSession, readStream, updateAgent } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('current runtime contract', () => {
  it('preserves Go AgentRecord casing and revision on edits', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ID: 'agent-1' }));
    vi.stubGlobal('fetch', fetcher);
    await updateAgent(
      {
        ID: 'agent-1',
        Key: 'kites/maya',
        Revision: 8,
        Spec: { Kind: 'codex' },
        Resume: { nativeId: 'n' },
      },
      { Kind: 'codex', Instructions: 'Be concise' },
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      ID: 'agent-1',
      Revision: 8,
      Resume: { nativeId: 'n' },
      Spec: { Instructions: 'Be concise' },
    });
  });
  it('creates a distinct runtime instance per profile in a group', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ID: 'a', Spec: { ID: 'a', Key: 'profile-a', Kind: 'codex' } }),
      )
      .mockResolvedValueOnce(Response.json({ ID: 'b', Spec: { ID: 'b', Kind: 'codex' } }))
      .mockResolvedValueOnce(Response.json({ id: 'sid-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'sid-1' }));
    vi.stubGlobal('fetch', fetcher);
    await createSession(['a', 'b'], 'Team');
    expect(JSON.parse(fetcher.mock.calls[2][1].body).members).toEqual([
      { agent: { Kind: 'codex', Metadata: { 'kites.profile': 'a' } } },
      { agent: { Kind: 'codex', Metadata: { 'kites.profile': 'b' } } },
    ]);
  });
  it('keeps unsupported status available for polling fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'No replay' }, { status: 501 })),
    );
    await expect(api('/api/v1/sessions/x/subscribe')).rejects.toMatchObject({
      status: 501,
      message: 'No replay',
    });
  });
  it('reads split UTF-8 and a final line without newline', async () => {
    const bytes = new TextEncoder().encode(
      '{"event_id":"a","payload":{"type":"text","content":"你好"}}\n{"event_id":"b","payload":{"type":"status","status":"idle"}}',
    );
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    });
    const received: unknown[] = [];
    await readStream(new Response(stream), (e) => received.push(e));
    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ payload: { content: '你好' } });
  });
  it('rejects in-stream errors instead of declaring success', async () => {
    await expect(
      readStream(new Response('{"error":"permission denied"}\n'), () => {}),
    ).rejects.toThrow('permission denied');
  });
});
