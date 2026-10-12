import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BotSessions, groupBotSessions } from './BotSessions';
import type { AgentRecord, Session } from './types';
const bot = {
  ID: 'profile',
  Key: 'pip',
  Spec: { Kind: 'codex', Metadata: { 'kites.name': 'Pip' } },
  Revision: 1,
} satisfies AgentRecord;
const session = (id: string, profile = 'profile'): Session => ({
  id,
  spec: {},
  status: 'idle',
  members: [],
  agents: [
    {
      id: id + '-member',
      status: 'idle',
      spec: { Kind: 'codex', Metadata: { 'kites.profile': profile, 'kites.name': 'Pip' } },
    },
  ],
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('groups by durable bot profile, never by a shared display name; groups appear once', () => {
  const group = session('group');
  group.agents.push(session('other').agents[0]);
  const result = groupBotSessions(
    [session('one'), session('two'), session('three', 'another'), group],
    [bot],
  );
  expect(result.map((g) => [g.id, g.sessions.length])).toEqual([
    ['profile', 2],
    ['another', 1],
    ['groups', 1],
  ]);
});
it('collapses sessions, persists that choice and creates a chat with the correct bot', () => {
  const onNew = vi.fn();
  render(
    <BotSessions sessions={[session('one')]} bots={[bot]} onNew={onNew}>
      {(s) => <p key={s.id}>{s.id}</p>}
    </BotSessions>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Chats with Pip' }));
  expect(screen.queryByText('one')).toBeNull();
  expect(JSON.parse(localStorage.getItem('kites.collapsedBots')!)).toEqual(['profile']);
  fireEvent.click(screen.getByRole('button', { name: 'New chat with Pip' }));
  expect(onNew).toHaveBeenCalledWith(bot, false);
});
