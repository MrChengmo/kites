import { useEffect, useRef, useState, type RefObject } from 'react';
import { getReading, markReading } from './api';
import { readingItems } from '../shared/reading.mjs';
import type { RuntimeEvent } from './types';
export function useReading(
  id: string,
  events: RuntimeEvent[],
  loading: boolean,
  scroll: RefObject<HTMLDivElement>,
  onRead?: () => void,
) {
  const [position, setPosition] = useState<{
    id: string;
    seq: number;
    boundary?: number;
    synced?: boolean;
  }>();
  const [failure, setFailure] = useState('');
  const saved = useRef(0);
  const items = readingItems(events).filter((event) => event.payload.type !== 'user/message');
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setFailure('');
    getReading([id])
      .then((state) => {
        if (cancelled) return;
        const summary = state[id];
        saved.current = summary?.readSeq || 0;
        setPosition({ id, seq: saved.current, boundary: summary?.firstUnreadSeq, synced: true });
      })
      .catch(() => {
        if (!cancelled) {
          setFailure('Could not sync reading position.');
          setPosition({ id, seq: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, loading]);
  const ready = position?.id === id;
  const seq = ready ? position.seq : 0;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const sync = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const summary = (await getReading([id]))[id];
        if (cancelled || !summary) return;
        saved.current = Math.max(saved.current, summary.readSeq);
        setPosition((old) =>
          old?.id === id
            ? {
                ...old,
                seq: Math.max(old.seq, summary.readSeq),
                boundary: old.synced ? old.boundary : summary.firstUnreadSeq,
                synced: true,
              }
            : old,
        );
        setFailure('');
      } catch {
        /* Keep the last confirmed read position until the connection recovers. */
      }
    };
    const timer = setInterval(() => void sync(), 5000);
    window.addEventListener('kites:resume', sync);
    window.addEventListener('focus', sync);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('kites:resume', sync);
      window.removeEventListener('focus', sync);
    };
  }, [id, ready]);

  useEffect(() => {
    if (!ready || failure || !scroll.current) return;
    const element = scroll.current;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let writing = false;
    let desired = saved.current;
    async function flush() {
      if (
        disposed ||
        writing ||
        desired <= saved.current ||
        document.visibilityState === 'hidden' ||
        !document.hasFocus()
      )
        return;
      writing = true;
      const next = desired;
      try {
        const result = await markReading(id, next);
        if (disposed) return;
        saved.current = result.readSeq;
        setPosition((old) => (old?.id === id ? { ...old, seq: result.readSeq } : old));
        onRead?.();
      } catch {
        if (!disposed) setFailure('Could not sync reading position.');
      } finally {
        writing = false;
        if (!disposed && desired > saved.current) timer = setTimeout(() => void flush(), 500);
      }
    }
    const inspect = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
      const viewport = element.getBoundingClientRect();
      for (const node of element.querySelectorAll<HTMLElement>('[data-read-seq]')) {
        const box = node.getBoundingClientRect();
        // A long response is read only after its end enters the viewport.
        if (box.bottom > viewport.top && box.bottom <= viewport.bottom + 2)
          desired = Math.max(desired, Number(node.dataset.readSeq) || 0);
      }
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 650);
    };
    const frame = requestAnimationFrame(inspect);
    element.addEventListener('scroll', inspect);
    document.addEventListener('visibilitychange', inspect);
    window.addEventListener('focus', inspect);
    window.addEventListener('resize', inspect);
    window.addEventListener('kites:resume', inspect);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      element.removeEventListener('scroll', inspect);
      document.removeEventListener('visibilitychange', inspect);
      window.removeEventListener('focus', inspect);
      window.removeEventListener('resize', inspect);
      window.removeEventListener('kites:resume', inspect);
    };
  }, [id, events, ready, failure, scroll, onRead]);
  return {
    ready,
    boundary: ready ? position.boundary : undefined,
    unread: items.filter((event) => event.seq! > seq).length,
    failure,
  };
}
