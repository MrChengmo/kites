import liveTape from '../tests/fixtures/conversation-history.json?raw';
import { describe, expect, it } from 'vitest';
import { projectEvents } from './events';
import { groupWork, plans, workers, workFiles, toolStatus, type WorkGroup } from './work';
import type { Payload, RuntimeEvent } from './types';
const event = (payload: Payload, turn = 'turn'): RuntimeEvent => ({
  agent_id: 'maya',
  turn_id: turn,
  event_id: crypto.randomUUID(),
  payload,
});
const work = (events: RuntimeEvent[]) =>
  groupWork(projectEvents(events)).find((b): b is WorkGroup => b.kind === 'work')!;
describe('conversation work projection', () => {
  it('groups activity once per request and keeps the latest plan per agent', () => {
    const events = [
      event({ type: 'user/message', prompt: 'One' }),
      event({ type: 'plan', tasks: [{ id: '1', title: 'Read', status: 'in_progress' }] }),
      event({ type: 'text', content: 'Read the brief.' }),
      event({ type: 'tool_use', id: 'read', tool: 'read' }),
      event({ type: 'plan', tasks: [{ id: '1', title: 'Read', status: 'completed' }] }),
      event({ type: 'user/message', prompt: 'Two' }, 'two'),
      event({ type: 'tool_use', id: 'read', tool: 'read' }, 'two'),
    ];
    const groups = groupWork(projectEvents(events)).filter(
      (b): b is WorkGroup => b.kind === 'work',
    );
    expect(groups).toHaveLength(2);
    expect(plans(groups[0])[0].tasks[0].status).toBe('completed');
    expect(groups[0].entries).toHaveLength(3);
  });
  it('builds collaborator records only from explicit provider thread IDs', () => {
    const group = work([
      event({
        type: 'tool_use',
        id: 'spawn',
        _meta: {
          codex_item: {
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            receiverThreadIds: ['child'],
            prompt: 'Review brief',
          },
        },
      }),
      event({
        type: 'tool_result',
        id: 'wait',
        status: 'completed',
        _meta: {
          codex_item: {
            type: 'collabAgentToolCall',
            receiverThreadIds: ['child'],
            agentsStates: { child: { status: 'completed', message: 'Brief is clear.' } },
          },
        },
      }),
    ]);
    expect(workers(group)[0]).toMatchObject({
      id: 'child',
      parent: 'maya',
      prompt: 'Review brief',
      status: 'completed',
      result: 'Brief is clear.',
    });
    expect(
      workers(
        work([
          event({
            type: 'tool_use',
            id: 'wait',
            _meta: {
              codex_item: { type: 'collabAgentToolCall', receiverThreadIds: [], agentsStates: {} },
            },
          }),
        ]),
      ),
    ).toEqual([]);
  });
  it('exposes completed file content and labels modifications as changes', () => {
    const group = work([
      event({
        type: 'tool_result',
        id: 'file',
        status: 'completed',
        _meta: {
          codex_item: {
            changes: [
              { path: '/work/brief.md', kind: { type: 'add' }, diff: '# Brief' },
              { path: '/work/a.ts', kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-a\n+b' },
            ],
          },
        },
      }),
      event({
        type: 'tool_result',
        id: 'failed',
        status: 'error',
        _meta: {
          codex_item: {
            changes: [{ path: '/work/failed.md', kind: { type: 'add' }, diff: 'Not written' }],
          },
        },
      }),
    ]);
    expect(workFiles(group).map((f) => [f.name, f.format])).toEqual([
      ['brief.md', 'File content'],
      ['a.ts', 'Change preview'],
    ]);
  });
  it('does not call an unfinished tool completed when a turn ends', () => {
    const events = [
      event({ type: 'tool_use', id: 't', tool: 'read' }),
      event({ type: 'status', status: 'cancelled' }),
    ];
    expect(toolStatus(projectEvents(events)[0], events)).toBe('Stopped');
  });
});

it('projects a sanitized Codex-shaped tape without duplicate tools or lost Chinese text', async () => {
  const tape = JSON.parse(liveTape);
  const entries = projectEvents(tape.events);
  const group = work(tape.events);
  expect(entries.filter((e) => e.kind === 'assistant')).toHaveLength(3);
  expect(group.entries.filter((e) => e.kind === 'tool')).toHaveLength(5);
  expect(workFiles(group)[0]).toMatchObject({ name: 'recommendation.md', format: 'File content' });
  expect(workFiles(group)[0].content).toContain('给你的智能伙伴起个名字');
  expect(plans(group)).toEqual([]);
  expect(workers(group)).toEqual([]);
});
