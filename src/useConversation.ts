import { useEffect, useRef, useState } from 'react';
import { api, APIError, encode, history, readStream, request, send } from './api';
import { appendEvent } from './events';
import type { Input, RuntimeEvent } from './types';
export function useConversation(id: string | undefined) {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  const current = useRef(id);
  current.current = id;
  const prompts = useRef(new Set<AbortController>());
  useEffect(() => {
    setEvents([]);
    setError('');
    setSending(false);
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    let cursor = 0;
    const accept = (event: RuntimeEvent) => {
      if (controller.signal.aborted) return;
      if (event.seq) cursor = Math.max(cursor, event.seq);
      setEvents((old) => appendEvent(old, event));
    };
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        controller.signal.addEventListener('abort', done, { once: true });
      });
    async function poll() {
      while (!controller.signal.aborted) {
        await pause(2500);
        if (controller.signal.aborted) return;
        if (document.visibilityState === 'hidden') continue;
        let next = cursor;
        do {
          const page = await api<{ events: RuntimeEvent[]; next_seq?: number }>(
            `/api/v1/sessions/${encode(id!)}/events?limit=1000&from_seq=${next}`,
            { signal: controller.signal },
          );
          for (const event of page.events || []) accept(event);
          if (!page.next_seq || page.next_seq === next) break;
          next = page.next_seq;
        } while (!controller.signal.aborted);
      }
    }
    async function watch() {
      try {
        const tape = await history(id!, controller.signal);
        if (controller.signal.aborted) return;
        for (const event of tape) accept(event);
        setLoading(false);
        let attempts = 0;
        while (!controller.signal.aborted && attempts < 5) {
          try {
            await readStream(
              await request(`/api/v1/sessions/${encode(id!)}/subscribe?from_seq=${cursor}`, {
                signal: controller.signal,
              }),
              accept,
            );
            if (!controller.signal.aborted) throw new Error('The live connection closed.');
          } catch (e) {
            if (controller.signal.aborted) return;
            if (e instanceof APIError && e.status === 501) {
              await poll();
              return;
            }
            attempts++;
            if (attempts === 5) throw e;
            await pause(Math.min(1000 * 2 ** attempts, 15000));
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const resume = () => retry((v) => v + 1);
    window.addEventListener('kites:resume', resume);
    void watch();
    return () => {
      window.removeEventListener('kites:resume', resume);
      controller.abort();
      for (const prompt of prompts.current) prompt.abort();
    };
  }, [id, revision]);
  async function submit(input: Input) {
    if (!id) return;
    const selected = id;
    setSending(true);
    setError('');
    const controller = new AbortController();
    prompts.current.add(controller);
    let rejected = '';
    try {
      await send(id, input, {
        signal: controller.signal,
        onEvent: (event) => {
          if (current.current !== selected) return;
          // Launch errors may only exist on the prompt stream, not the tape.
          if (event.payload.type === 'error') {
            const message = event.payload.message || 'The agent reported an error.';
            setError(message);
            if (event.payload.code === 'send') {
              rejected = message;
              return;
            }
          }
          setEvents((old) => appendEvent(old, event));
        },
      });
      if (rejected) throw new Error(rejected);
      // The prompt stream includes transient deltas that are not stored in the
      // tape. Replace them with the authoritative history at the turn boundary.
      try {
        const tape = await history(id, controller.signal);
        if (current.current === selected && !controller.signal.aborted) setEvents(tape);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(`Response received. Could not refresh history: ${(error as Error).message}`);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
        throw e;
      }
    } finally {
      prompts.current.delete(controller);
      if (current.current === selected) setSending(prompts.current.size > 0);
    }
  }
  async function interrupt() {
    if (!id) return;
    try {
      await api(`/api/v1/sessions/${encode(id)}/interrupt`, { method: 'POST', body: '{}' });
      setSending(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return { events, loading, sending, error, submit, interrupt, retry: () => retry((v) => v + 1) };
}
