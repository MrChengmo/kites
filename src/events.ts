import type { Payload, RuntimeEvent } from './types';
export interface Entry {
  id: string;
  agentId?: string;
  turnId?: string;
  kind: 'user' | 'assistant' | 'tool' | 'ask' | 'error' | 'info' | 'thinking' | 'plan' | 'image';
  text: string;
  payload: Payload;
  createdAt?: string;
  seq?: number;
  pending?: boolean;
}
export function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value
      .map((v) => (typeof v === 'object' && v !== null ? textContent(v.text ?? v.content) : ''))
      .filter(Boolean)
      .join('\n');
  return '';
}
export function appendEvent(events: RuntimeEvent[], event: RuntimeEvent) {
  const existing = event.event_id ? events.findIndex((e) => e.event_id === event.event_id) : -1;
  if (existing >= 0 && (!event.seq || events[existing].seq === event.seq)) return events;
  const merged = existing < 0 ? [...events] : events.filter((_, index) => index !== existing);
  const before = event.seq ? merged.findIndex((e) => !e.seq || e.seq > event.seq!) : -1;
  if (before < 0) merged.push(event);
  else merged.splice(before, 0, event);
  return merged;
}
export function projectEvents(events: RuntimeEvent[]): Entry[] {
  const entries: Entry[] = [];
  const completed = new Set(
    events
      .filter(
        (e) =>
          e.agent_id &&
          e.turn_id &&
          e.payload?.type === 'status' &&
          ['idle', 'ended', 'failed', 'cancelled'].includes(e.payload.status || ''),
      )
      .map((e) => `${e.agent_id}:${e.turn_id}`),
  );
  // The subscription can deliver a committed text run while the prompt stream
  // still holds its token deltas. Remove only exact copies of committed runs.
  const committedDeltas = new Set<RuntimeEvent>();
  const deltaRuns = new Map<string, RuntimeEvent[]>();
  for (const event of events) {
    if (!event.seq && event.payload.partial && ['text', 'thinking'].includes(event.payload.type)) {
      const key = `${event.agent_id}:${event.turn_id}:${event.payload.type}`;
      const run = deltaRuns.get(key) || [];
      run.push(event);
      deltaRuns.set(key, run);
    }
  }
  for (const event of events) {
    if (!event.seq || event.payload.partial || !['text', 'thinking'].includes(event.payload.type))
      continue;
    const key = `${event.agent_id}:${event.turn_id}:${event.payload.type}`;
    const run = deltaRuns.get(key);
    if (!run?.length) continue;
    const text = textContent(event.payload.content);
    let prefix = '';
    let count = 0;
    while (count < run.length && prefix.length < text.length)
      prefix += textContent(run[count++].payload.content);
    if (text && prefix === text)
      for (const delta of run.splice(0, count)) committedDeltas.add(delta);
  }
  const partials = new Map<string, Entry>();
  const tools = new Map<string, Entry>();
  const asks = new Map<string, Entry>();
  for (const [index, event] of events.entries()) {
    const p = event.payload;
    if (!p || committedDeltas.has(event)) continue;
    const base = {
      id: event.event_id || `${index}`,
      agentId: event.agent_id,
      turnId: event.turn_id,
      text: '',
      payload: p,
      createdAt: event.created_at,
      seq: event.seq,
    };
    const key = `${event.agent_id || ''}:${event.turn_id || ''}`;
    if (['text', 'thinking'].includes(p.type) && p.partial && !event.seq && completed.has(key))
      continue;
    // A different payload ends the provider's text run. Commentary, reasoning,
    // and the final answer must never concatenate across tool boundaries.
    for (const kind of ['text', 'thinking']) {
      if (p.type === kind) continue;
      const pending = partials.get(`${key}:${kind}`);
      if (pending) pending.pending = false;
      partials.delete(`${key}:${kind}`);
    }
    if (p.type === 'user/message') {
      const text = p.prompt || (p.messages || []).map((m) => textContent(m.content)).join('\n');
      const previous = entries.at(-1);
      // Agentway records one ingress per target for a broadcast. Collapse the
      // adjacent copies while keeping repeat prompts to the same agent intact.
      if (
        previous?.kind === 'user' &&
        previous.text === text &&
        JSON.stringify(previous.payload.messages) === JSON.stringify(p.messages) &&
        previous.agentId !== event.agent_id &&
        previous.createdAt &&
        event.created_at &&
        Math.abs(Date.parse(previous.createdAt) - Date.parse(event.created_at)) < 100
      )
        continue;
      entries.push({
        ...base,
        kind: 'user',
        text: p.prompt || (p.messages || []).map((m) => textContent(m.content)).join('\n'),
      });
      partials.clear();
    }
    if (p.type === 'text' || p.type === 'thinking') {
      const text = textContent(p.content);
      const pending = partials.get(`${key}:${p.type}`);
      if (pending) {
        pending.text = p.partial ? pending.text + text : text;
        pending.pending = !!p.partial;
        pending.payload = p;
        if (event.seq) pending.seq = event.seq;
        if (!p.partial) partials.delete(`${key}:${p.type}`);
      } else {
        const entry: Entry = {
          ...base,
          kind: p.type === 'thinking' ? 'thinking' : 'assistant',
          text,
          pending: !!p.partial,
        };
        entries.push(entry);
        if (p.partial) partials.set(`${key}:${p.type}`, entry);
      }
    }
    if (p.type === 'tool_use') {
      const entry: Entry = { ...base, kind: 'tool', text: p.title || p.tool || 'Using a tool' };
      entries.push(entry);
      tools.set(`${key}:${p.id}`, entry);
    }
    if (p.type === 'tool_result') {
      const toolKey = `${key}:${p.id}`;
      const entry = tools.get(toolKey);
      if (entry) {
        const content =
          p.status === 'running' && Array.isArray(p.content)
            ? [...(Array.isArray(entry.payload.content) ? entry.payload.content : []), ...p.content]
            : p.content;
        entry.payload = { ...entry.payload, ...p, content };
      } else {
        const result: Entry = { ...base, kind: 'tool', text: p.tool || 'Tool result' };
        entries.push(result);
        tools.set(toolKey, result);
      }
    }
    if (p.type === 'plan') entries.push({ ...base, kind: 'plan' });
    if (p.type === 'image') entries.push({ ...base, kind: 'image' });
    if (p.type === 'ask' && p.requestId) {
      const previous = asks.get(`${event.agent_id}:${p.requestId}`);
      if (previous) {
        previous.payload = p;
        previous.pending = !!p.awaitingReply;
      } else {
        const entry: Entry = {
          ...base,
          kind: 'ask',
          text: p.title || 'Your input is needed',
          pending: !!p.awaitingReply,
        };
        entries.push(entry);
        asks.set(`${event.agent_id}:${p.requestId}`, entry);
      }
    }
    if (['ask/reply', 'ask_resolved'].includes(p.type) && p.requestId) {
      const ask = asks.get(`${event.agent_id}:${p.requestId}`);
      if (ask) {
        ask.pending = false;
        ask.payload = { ...ask.payload, answers: p.answers || ask.payload.answers };
      }
    }
    if (p.type === 'error')
      entries.push({ ...base, kind: 'error', text: p.message || 'The bot reported an error.' });
  }
  return entries;
}
export function transcript(events: RuntimeEvent[]) {
  return projectEvents(events)
    .filter((e) => ['user', 'assistant'].includes(e.kind))
    .map((e) => `## ${e.kind === 'user' ? 'You' : 'Bot'}\n\n${e.text}`)
    .join('\n\n');
}
