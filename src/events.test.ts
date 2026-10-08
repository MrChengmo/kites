import { describe, expect, it } from 'vitest';
import { appendEvent, projectEvents, transcript } from './events';
import type { RuntimeEvent, Payload } from './types';
const event = (payload: Payload, extra: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  event_id: crypto.randomUUID(),
  agent_id: 'maya',
  turn_id: 'turn',
  payload,
  ...extra,
});
describe('Agentway event rendering', () => {
  it('orders persisted ingress before a streamed reply and fills its sequence', () => {
    const reply = event({ type: 'text', content: 'answer', partial: false }, { event_id: 'reply' });
    let events = appendEvent(
      [reply],
      event({ type: 'user/message', prompt: 'question' }, { seq: 1 }),
    );
    events = appendEvent(events, { ...reply, seq: 2 });
    expect(projectEvents(events).map((e) => e.kind)).toEqual(['user', 'assistant']);
    expect(events[1].seq).toBe(2);
  });
  it('deduplicates prompt and subscription deliveries', () => {
    const e = event({ type: 'text', content: 'Hi', partial: false });
    expect(appendEvent([e], e)).toEqual([e]);
  });
  it('replaces a stream with the final text instead of repeating it', () => {
    const entries = projectEvents([
      event({ type: 'text', content: 'Hel', partial: true }),
      event({ type: 'text', content: 'lo', partial: true }),
      event({ type: 'text', content: 'Hello', partial: false }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Hello');
    expect(entries[0].pending).toBe(false);
  });
  it('keeps interleaved group replies separate', () => {
    const entries = projectEvents([
      event({ type: 'text', content: 'A', partial: true }),
      event({ type: 'text', content: 'B', partial: true }, { agent_id: 'theo' }),
      event({ type: 'text', content: 'AC', partial: false }),
    ]);
    expect(entries.map((e) => e.text)).toEqual(['AC', 'B']);
  });
  it('updates tools and resolves questions by provider request ID', () => {
    const entries = projectEvents([
      event({ type: 'tool_use', id: 'read', tool: 'read_file', title: 'Reading notes' }),
      event({
        type: 'tool_result',
        id: 'read',
        tool: 'read_file',
        status: 'completed',
        content: [{ type: 'text', text: 'notes' }],
      }),
      event({ type: 'ask', requestId: 'approval', awaitingReply: true, title: 'Allow?' }),
      event({ type: 'ask/reply', requestId: 'approval' }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].payload.status).toBe('completed');
    expect(entries[1].pending).toBe(false);
  });
  it('exports user input and the completed reply', () => {
    expect(
      transcript([
        event({
          type: 'user/message',
          messages: [{ content: [{ type: 'text', text: 'Question' }] }],
        }),
        event({ type: 'text', content: 'Answer', partial: false }),
      ]),
    ).toBe('## You\n\nQuestion\n\n## Bot\n\nAnswer');
  });
});

it('drops transient unsequenced deltas after their turn completes', () => {
  const partial = event({ type: 'text', partial: true, content: 'Hello' });
  const final = event({ type: 'text', partial: false, content: 'Hello' }, { seq: 8 });
  const status = event({ type: 'status', status: 'idle' }, { seq: 9 });
  expect(projectEvents([final, status, partial]).map((e) => e.text)).toEqual(['Hello']);
});
it('renders one broadcast bubble but preserves repeated prompts to one agent', () => {
  const a = event(
    { type: 'user/message', prompt: 'Hello' },
    { created_at: '2026-10-04T00:00:00.000Z' },
  );
  const b = event(
    { type: 'user/message', prompt: 'Hello' },
    { agent_id: 'theo', created_at: '2026-10-04T00:00:00.001Z' },
  );
  expect(projectEvents([a, b])).toHaveLength(1);
  expect(projectEvents([a, { ...b, agent_id: 'maya' }])).toHaveLength(2);
});

it('keeps commentary, thinking, tools, and final text in separate runs', () => {
  const entries = projectEvents([
    event({ type: 'text', content: 'Reading the brief.', partial: true }, { seq: 1 }),
    event({ type: 'thinking', content: 'Compare the constraints.', partial: true }, { seq: 2 }),
    event({ type: 'tool_use', id: 'read', tool: 'read_file' }),
    event({ type: 'text', content: 'The result.', partial: true }, { seq: 4 }),
    event({ type: 'status', status: 'idle' }),
  ]);
  expect(entries.map((e) => [e.kind, e.text])).toEqual([
    ['assistant', 'Reading the brief.'],
    ['thinking', 'Compare the constraints.'],
    ['tool', 'read_file'],
    ['assistant', 'The result.'],
  ]);
  expect(entries.some((e) => e.pending)).toBe(false);
});
it('scopes repeated tool IDs to turns and merges result-only updates', () => {
  const entries = projectEvents([
    event({ type: 'tool_use', id: 'same', tool: 'read_file' }),
    event({ type: 'tool_result', id: 'same', status: 'completed', content: 'one' }),
    event({ type: 'tool_use', id: 'same', tool: 'read_file' }, { turn_id: 'two' }),
    event(
      { type: 'tool_result', id: 'same', status: 'completed', content: 'two' },
      { turn_id: 'two' },
    ),
    event({ type: 'tool_result', id: 'output', status: 'running', content: [{ text: 'a' }] }),
    event({ type: 'tool_result', id: 'output', status: 'running', content: [{ text: 'b' }] }),
    event({ type: 'tool_result', id: 'output', status: 'completed', content: [{ text: 'ab' }] }),
  ]);
  expect(entries).toHaveLength(3);
  expect(entries.map((e) => e.payload.content)).toEqual(['one', 'two', [{ text: 'ab' }]]);
});
it('preserves recorded answers and isolates matching request IDs across agents', () => {
  const entries = projectEvents([
    event({ type: 'ask', requestId: 'q', awaitingReply: true }),
    event({ type: 'ask', requestId: 'q', awaitingReply: true }, { agent_id: 'theo' }),
    event({ type: 'ask/reply', requestId: 'q', answers: { direction: { value: 'daily' } } }),
    event({ type: 'ask_resolved', requestId: 'q' }),
  ]);
  expect(entries[0].payload.answers?.direction.value).toBe('daily');
  expect(entries.map((e) => e.pending)).toEqual([false, true]);
});
it('reconciles committed commentary with its prompt deltas while the turn is still running', () => {
  const entries = projectEvents([
    event({ type: 'text', content: 'Read the brief.', partial: false }, { seq: 3 }),
    event({ type: 'tool_use', id: 'r', tool: 'read' }, { seq: 4 }),
    event({ type: 'text', content: 'Read ', partial: true }),
    event({ type: 'text', content: 'the brief.', partial: true }),
    event({ type: 'text', content: 'Next update.', partial: true }),
  ]);
  expect(entries.filter((e) => e.kind === 'assistant').map((e) => e.text)).toEqual([
    'Read the brief.',
    'Next update.',
  ]);
});
