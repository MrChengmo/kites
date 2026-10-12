import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Conversation } from './Conversation';
const state = vi.hoisted(() => ({
  events: [
    {
      event_id: 'e1',
      seq: 1,
      agent_id: 'bot',
      created_at: '2026-10-06T08:00:00Z',
      payload: { type: 'text', content: 'Earlier answer' },
    },
    {
      event_id: 'e2',
      seq: 2,
      agent_id: 'bot',
      created_at: '2026-10-07T08:00:00Z',
      payload: { type: 'text', content: 'Unread answer' },
    },
    {
      event_id: 'e3',
      seq: 3,
      agent_id: 'bot',
      created_at: '2026-10-07T08:01:00Z',
      payload: { type: 'text', content: 'Follow-up answer' },
    },
  ],
}));
vi.mock('./useConversation', () => ({
  useConversation: () => ({
    ...state,
    loading: false,
    sending: false,
    error: '',
    submit: vi.fn(),
    interrupt: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock('./useReading', () => ({
  useReading: () => ({ ready: true, boundary: 2, unread: 2, failure: '' }),
}));
afterEach(cleanup);
it('keeps NEW before first unread, groups speakers and exposes overflow actions', async () => {
  Element.prototype.scrollTo = vi.fn();
  const session = {
    id: 'chat',
    status: 'idle',
    spec: {},
    members: [],
    agents: [
      { id: 'bot', status: 'idle', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Pip' } } },
    ],
  };
  const { container, rerender } = render(
    <Conversation
      session={session}
      title="Research"
      onBack={vi.fn()}
      onDetails={vi.fn()}
      onSaved={async () => {}}
    />,
  );
  await waitFor(() => expect(screen.getByText('NEW')).toBeTruthy());
  expect(container.querySelector('.new-divider')?.parentElement?.textContent).toContain(
    'Unread answer',
  );
  expect(container.querySelectorAll('.message-author')).toHaveLength(2);
  expect(container.querySelector('.same-speaker')?.textContent).toContain('Follow-up answer');
  expect(screen.getByRole('button', { name: '2 new messages' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Chat menu' }));
  expect(screen.getByRole('button', { name: 'Chat details' })).toBeTruthy();
  rerender(
    <Conversation
      session={session}
      title="Research"
      onBack={vi.fn()}
      onDetails={vi.fn()}
      onSaved={async () => {}}
    />,
  );
  expect(screen.getAllByText('NEW')).toHaveLength(1);
});
