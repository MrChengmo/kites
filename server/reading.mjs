import { readingSummary } from '../shared/reading.mjs';
export function createReading(store, runtime) {
  const tapes = new Map();
  async function summary(id) {
    let cache = tapes.get(id);
    if (!cache) {
      cache = { events: [], seq: 0 };
      tapes.set(id, cache);
    }
    if (!cache.pending)
      cache.pending = (async () => {
        let cursor = cache.seq;
        do {
          const response = await runtime(
            `/api/v1/sessions/${encodeURIComponent(id)}/events?limit=1000&from_seq=${cursor}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!response.ok)
            throw Object.assign(new Error('Conversation history is unavailable.'), {
              status: response.status,
            });
          const page = await response.json();
          for (const event of page.events || []) {
            if (event.seq > cache.seq) cache.events.push(event);
            cache.seq = Math.max(cache.seq, event.seq || 0);
          }
          if (!page.next_seq || page.next_seq <= cursor) break;
          cursor = page.next_seq;
        } while (cursor > 0);
      })().finally(() => {
        cache.pending = null;
      });
    await cache.pending;
    return readingSummary(cache.events, store.get('reading', id)?.readSeq || 0);
  }
  return {
    async get(ids) {
      return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await summary(id)])));
    },
    async mark(id, seq) {
      if (!Number.isSafeInteger(seq) || seq < 0)
        throw Object.assign(new Error('Use a non-negative read sequence.'), { status: 400 });
      const current = await summary(id);
      if (seq > current.latestSeq)
        throw Object.assign(new Error('Read position exceeds conversation history.'), {
          status: 400,
        });
      const readSeq = Math.max(store.get('reading', id)?.readSeq || 0, seq);
      store.put('reading', { id, readSeq });
      return readingSummary(tapes.get(id).events, readSeq);
    },
  };
}
