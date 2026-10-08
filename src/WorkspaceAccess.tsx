import { Folder, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import {
  workspaceAccess,
  workspaceAllowed,
  sessionPlace,
  type WorkspaceAccess as Access,
} from '../shared/workspaceAccess.mjs';
import { changeWorkspace } from './api';
import { EnvironmentWorkspaces, WorkspacePicker } from './Environments';
import { t } from './i18n';
import type { AgentSpec, Environment, Session } from './types';
import { Form } from './ui';

export function workspaceDescription(session: Session, environments: Environment[]) {
  const place = sessionPlace(session.spec);
  const environment = environments.find((e) => e.ID === place.environment);
  const workspace = environment?.Workspaces?.find((w) => w.id === place.workspace);
  const name =
    workspace?.key || workspace?.cwd?.split('/').filter(Boolean).at(-1) || place.workspace;
  const label = place.environment
    ? name
      ? `${name} · ${environment?.Key || t(environment?.Spec.Kind === 'local' ? 'Local' : 'Environment')}`
      : `${environment?.Key || t(environment?.Spec.Kind === 'local' ? 'Local' : 'Environment')} · ${t('Environment root')}`
    : t('Provider workspace');
  const cwd = workspace?.cwd || environment?.Spec.Roots?.[0] || '';
  const modes = session.agents.map((a) => a.spec.Sandbox);
  const readOnly = modes.length > 0 && modes.every((mode) => mode === 'read-only');
  return { ...place, label, cwd, readOnly };
}
export function WorkspaceBadge({
  session,
  environments,
  onClick,
}: {
  session: Session;
  environments: Environment[];
  onClick?: () => void;
}) {
  const info = workspaceDescription(session, environments);
  const content = (
    <>
      <Folder size={12} />
      <span>{info.label}</span>
      {info.readOnly && <LockKeyhole size={11} />}
    </>
  );
  const title = [info.label, info.cwd, info.readOnly ? t('Read only') : '']
    .filter(Boolean)
    .join('\n');
  return onClick ? (
    <button
      type="button"
      className="workspace-badge"
      title={title}
      aria-label={t('Change workspace')}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className="workspace-badge" title={title}>
      {content}
    </span>
  );
}
export function WorkspaceAccessEditor({
  value,
  onChange,
  environments,
}: {
  value: Access;
  onChange: (value: Access) => void;
  environments: Environment[];
}) {
  const rows = environments
    .filter((e) => e.Spec.Kind !== 'remote' && (e.Key || e.Workspaces?.length))
    .flatMap((e) => [
      {
        environment: e.ID,
        workspace: '',
        label: `${e.Key || t('Environment')} · ${t('Environment root')}`,
        cwd: e.Spec.Roots?.[0],
      },
      ...(e.Workspaces || [])
        .filter((w) => !w.archived)
        .map((w) => ({
          environment: e.ID,
          workspace: w.id,
          label: w.key || w.cwd || w.id,
          cwd: w.cwd,
        })),
    ]);
  return (
    <div className="workspace-access">
      <label className="check-row">
        <input
          type="checkbox"
          checked={value.restricted}
          onChange={(e) => onChange({ ...value, restricted: e.target.checked })}
        />
        {t('Only selected workspaces')}
      </label>
      {!value.restricted ? (
        <p className="muted small">
          {t('Any available workspace can be selected. Provider permissions apply.')}
        </p>
      ) : (
        <>
          <p className="muted small">
            {t(
              'Choose where this bot can run and whether it can edit files. Requires Codex without plugins. Reads outside the workspace depend on the environment sandbox.',
            )}
          </p>
          {rows.map((row) => {
            const grant = value.workspaces.find(
              (g) => g.environment === row.environment && g.workspace === row.workspace,
            );
            const remaining = value.workspaces.filter(
              (g) => g.environment !== row.environment || g.workspace !== row.workspace,
            );
            return (
              <div className="workspace-access-row" key={`${row.environment}/${row.workspace}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!grant}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        workspaces: e.target.checked
                          ? [
                              ...remaining,
                              {
                                environment: row.environment,
                                workspace: row.workspace,
                                mode: 'read',
                              },
                            ]
                          : remaining,
                      })
                    }
                  />
                  <span>
                    <strong>{row.label}</strong>
                    <small>{row.cwd}</small>
                  </span>
                </label>
                <select
                  aria-label={t('Access for {name}', { name: row.label })}
                  disabled={!grant}
                  value={grant?.mode || 'read'}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      workspaces: [
                        ...remaining,
                        {
                          environment: row.environment,
                          workspace: row.workspace,
                          mode: e.target.value as 'read' | 'write',
                        },
                      ],
                    })
                  }
                >
                  <option value="read">{t('Read only')}</option>
                  <option value="write">{t('Read & write')}</option>
                </select>
              </div>
            );
          })}
          {!rows.length && <p className="muted">{t('Create a workspace in Settings first.')}</p>}
        </>
      )}
    </div>
  );
}
export function ChatWorkspaceEditor({
  session,
  environments,
  bots,
  onSaved,
  onRefresh,
}: {
  session: Session;
  environments: Environment[];
  bots: AgentSpec[];
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const initial = sessionPlace(session.spec);
  const [environment, setEnvironment] = useState(initial.environment);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const busy =
    ['running', 'starting'].includes(session.status) ||
    session.agents.some((a) =>
      ['running', 'starting', 'blocked', 'waiting_permission'].includes(a.status),
    );
  const selected = environments.find((e) => e.ID === environment);
  const ws = selected?.Workspaces?.find((w) => w.id === workspace);
  return (
    <div className="chat-workspace-editor">
      <WorkspaceBadge session={session} environments={environments} />
      <p className="muted small">
        {t(
          'The next message runs here. Chat history stays in this conversation; files stay in their original folders.',
        )}
      </p>
      {busy ? (
        <p className="notice">{t('Stop or finish the current turn before changing workspace.')}</p>
      ) : (
        <Form
          label={t('Apply workspace')}
          submit={async () => {
            if (!environment) throw new Error('Choose an environment.');
            if (!bots.every((spec) => workspaceAllowed(spec, { environment, workspace })))
              throw new Error('This workspace is not permitted for every bot in this chat.');
            await changeWorkspace(session.id, { environment, workspace });
            await onSaved();
          }}
        >
          <WorkspacePicker
            environments={environments}
            environment={environment}
            workspace={workspace}
            bots={bots}
            allowDefault={false}
            onChange={(env, id) => {
              setEnvironment(env);
              setWorkspace(id);
            }}
          />
          <div className="workspace-folder">
            <Folder size={16} />
            <code>{ws?.cwd || selected?.Spec.Roots?.[0] || t('Choose a workspace')}</code>
          </div>
        </Form>
      )}
      {selected && !busy && <EnvironmentWorkspaces environment={selected} onSaved={onRefresh} />}
    </div>
  );
}
export { workspaceAccess };
