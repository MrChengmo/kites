import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkCard, WorkPanel } from './ConversationWork';
import type { WorkGroup } from './work';
afterEach(cleanup);
const group: WorkGroup = {
  id: 'work',
  kind: 'work',
  entries: [
    {
      id: 'plan',
      agentId: 'maya',
      kind: 'plan',
      text: '',
      payload: {
        type: 'plan',
        tasks: [
          { id: 'read', title: 'Read the brief', status: 'completed' },
          { id: 'write', title: 'Write the recommendation', status: 'in_progress' },
        ],
      },
    },
    {
      id: 'child',
      agentId: 'maya',
      kind: 'tool',
      text: 'spawnAgent',
      payload: {
        type: 'tool_result',
        status: 'completed',
        _meta: {
          codex_item: {
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            receiverThreadIds: ['child-thread'],
            prompt: 'Review the brief',
            agentsStates: {
              'child-thread': {
                nickname: 'Theo',
                status: 'completed',
                message: 'Keep the introduction specific.',
              },
            },
          },
        },
      },
    },
    {
      id: 'file',
      agentId: 'maya',
      kind: 'tool',
      text: 'fileChange',
      payload: {
        type: 'tool_result',
        status: 'completed',
        _meta: {
          codex_item: {
            changes: [
              {
                path: '/work/brief.md',
                kind: { type: 'add' },
                diff: '# A clear brief\n\n具体、自然。',
              },
            ],
          },
        },
      },
    },
  ],
};
const members = [
  { id: 'maya', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Maya' } }, status: 'running' },
];
it('renders actual plan completion counts with an expandable step list', () => {
  render(<WorkCard group={group} members={members} events={[]} open={() => {}} />);
  expect(screen.getByText('1 / 2 steps complete')).toBeTruthy();
  const heading = screen.getByText('Write the recommendation', { selector: 'strong' });
  fireEvent.click(heading);
  expect(heading.closest('details')?.open).toBe(true);
});
it('opens a collaborator assignment and returned summary', () => {
  render(<WorkPanel group={group} members={members} events={[]} close={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Theo task' }));
  expect(screen.getByRole('heading', { name: 'Assignment' })).toBeTruthy();
  expect(screen.getByText('Keep the introduction specific.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
  expect(screen.getByRole('heading', { name: 'Collaborators' })).toBeTruthy();
});
it('previews actual file content and closes with Escape', () => {
  const close = vi.fn();
  render(<WorkPanel group={group} members={members} events={[]} close={close} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview brief.md' }));
  expect(screen.getByRole('heading', { name: 'A clear brief' })).toBeTruthy();
  expect(screen.getByText('具体、自然。')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});
