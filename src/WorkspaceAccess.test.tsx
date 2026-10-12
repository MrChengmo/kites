import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceBadge, WorkspaceAccessEditor, ChatWorkspaceEditor } from './WorkspaceAccess';
import { workspaceMode, workspaceAccessKey } from '../shared/workspaceAccess.mjs';
import { WorkspacePicker, EnvironmentWorkspaces } from './Environments';
import type { Environment, Session } from './types';
const environments: Environment[] = [
  {
    ID: 'env',
    Key: 'Studio',
    Spec: { Kind: 'local', Roots: ['/studio'] },
    Revision: 1,
    Workspaces: [
      { id: 'design', key: 'Design', cwd: '/studio/design' },
      { id: 'research', key: 'Research', cwd: '/studio/research' },
    ],
  },
];
const session: Session = {
  id: 'sid',
  spec: { EnvironmentID: 'env', workspace_id: 'design' },
  status: 'idle',
  agents: [{ id: 'bot', spec: { Kind: 'codex', Sandbox: 'read-only' }, status: 'idle' }],
  members: [],
};
const restricted = {
  Kind: 'codex',
  Metadata: {
    [workspaceAccessKey]: JSON.stringify({
      restricted: true,
      workspaces: [{ environment: 'env', workspace: 'design', mode: 'read' }],
    }),
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('workspace access', () => {
  it('resolves the runtime workspace ID to a readable badge and folder', () => {
    render(<WorkspaceBadge session={session} environments={environments} />);
    expect(
      screen.getByText('Design · Studio').closest('span.workspace-badge')?.getAttribute('title'),
    ).toContain('/studio/design');
  });
  it('shows only the workspace in the tree while keeping environment details elsewhere', () => {
    const { rerender } = render(
      <WorkspaceBadge session={session} environments={environments} workspaceOnly />,
    );
    expect(screen.getByText('Design')).toBeTruthy();
    expect(screen.queryByText(/Studio/)).toBeNull();
    rerender(<WorkspaceBadge session={session} environments={environments} />);
    expect(screen.getByText('Design · Studio')).toBeTruthy();
    rerender(
      <WorkspaceBadge
        session={{ ...session, spec: { EnvironmentID: 'env' } }}
        environments={environments}
        workspaceOnly
      />,
    );
    expect(screen.queryByText(/Environment root/)).toBeNull();
    expect(document.querySelector('.workspace-badge')).toBeNull();
  });
  it('limits the picker to permitted workspaces', () => {
    render(
      <WorkspacePicker
        environments={environments}
        environment="env"
        workspace="design"
        bots={[restricted]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole('option', { name: 'Research' })).toBeNull();
    expect(
      (screen.getByRole('option', { name: 'Environment root' }) as HTMLOptionElement).disabled,
    ).toBe(true);
  });
  it('denies unlisted workspaces, unsupported providers, and plugins', () => {
    expect(workspaceMode(restricted, { environment: 'env', workspace: 'design' })).toBe(
      'read-only',
    );
    expect(() => workspaceMode(restricted, { environment: 'env', workspace: 'research' })).toThrow(
      'not permitted',
    );
    expect(() =>
      workspaceMode({ ...restricted, Kind: 'grok' }, { environment: 'env', workspace: 'design' }),
    ).toThrow('Codex');
    expect(() =>
      workspaceMode(
        { ...restricted, MCP: [{ Name: 'files', Command: 'server' }] },
        { environment: 'env', workspace: 'design' },
      ),
    ).toThrow('plugins');
  });
  it('saves access mode changes with stable workspace identities', () => {
    const changed = vi.fn();
    render(
      <WorkspaceAccessEditor
        value={{
          restricted: true,
          workspaces: [{ environment: 'env', workspace: 'design', mode: 'read' }],
        }}
        environments={environments}
        onChange={changed}
      />,
    );
    fireEvent.change(screen.getByLabelText('Access for Design'), { target: { value: 'write' } });
    expect(changed).toHaveBeenCalledWith({
      restricted: true,
      workspaces: [{ environment: 'env', workspace: 'design', mode: 'write' }],
    });
  });
  it('changes the same session workspace before calling onSaved', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...session, spec: { EnvironmentID: 'env', workspace_id: 'research' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatWorkspaceEditor
        session={session}
        environments={environments}
        bots={[]}
        onSaved={saved}
        onRefresh={saved}
      />,
    );
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'research' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply workspace' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(fetcher.mock.calls[0][0]).toContain('/sessions/sid/workspace');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      environment_id: 'env',
      workspace_id: 'research',
    });
  });
  it('blocks workspace changes while a bot is running', () => {
    render(
      <ChatWorkspaceEditor
        session={{ ...session, agents: [{ ...session.agents[0], status: 'running' }] }}
        environments={environments}
        bots={[]}
        onSaved={async () => {}}
        onRefresh={async () => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Apply workspace' })).toBeNull();
    expect(
      screen.getByText('Stop or finish the current turn before changing workspace.'),
    ).toBeTruthy();
  });
});

describe('workspace archive', () => {
  it('requires confirmation, supports cancel, and refreshes after archiving', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<EnvironmentWorkspaces environment={environments[0]} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive workspace: Design' }));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText(
        'This hides the workspace from new selections. Files and existing chats are kept.',
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Archive workspace: Design' }));
    fireEvent.click(screen.getByRole('button', { name: /^Archive workspace$/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(fetcher.mock.calls[0][0]).toContain('/environments/env/workspaces/design/archive');
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
  });
  it('shows a server error and keeps the confirmation available for retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Workspace is busy', { status: 409 })),
    );
    const onSaved = vi.fn();
    render(<EnvironmentWorkspaces environment={environments[0]} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive workspace: Design' }));
    fireEvent.click(screen.getByRole('button', { name: /^Archive workspace$/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Workspace is busy'),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
