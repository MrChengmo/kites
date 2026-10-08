import { useState } from 'react';
import { t } from './i18n';
import { api, encode } from './api';
import { workspaceAllowed } from '../shared/workspaceAccess.mjs';
import type { AgentSpec, Environment } from './types';
import { Field, Form } from './ui';

export function WorkspacePicker({
  environments,
  environment,
  workspace,
  onChange,
  bots = [],
  allowDefault = true,
}: {
  environments: Environment[];
  environment: string;
  workspace: string;
  onChange: (environment: string, workspace: string) => void;
  bots?: AgentSpec[];
  allowDefault?: boolean;
}) {
  const allowed = (env: string, ws: string) =>
    bots.every((bot) => workspaceAllowed(bot, { environment: env, workspace: ws }));
  const selected = environments.find((e) => e.ID === environment);
  return (
    <div className="form-grid">
      <Field label={t('Environment')}>
        <select value={environment} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">{t(allowDefault ? 'Bot default' : 'Choose an environment')}</option>
          {environments
            .filter(
              (e) =>
                (e.Spec.Kind !== 'remote' && (e.Key || e.Workspaces?.length)) ||
                e.ID === environment,
            )
            .filter(
              (e) =>
                allowed(e.ID, '') ||
                e.Workspaces?.some((w) => !w.archived && allowed(e.ID, w.id)) ||
                e.ID === environment,
            )
            .map((e) => (
              <option key={e.ID} value={e.ID}>
                {e.Key || e.ID} · {e.Spec.Kind}
              </option>
            ))}
        </select>
      </Field>
      <Field label={t('Workspace')}>
        <select
          disabled={!environment}
          value={workspace}
          onChange={(e) => onChange(environment, e.target.value)}
        >
          <option value="" disabled={!!environment && !allowed(environment, '')}>
            {t('Environment root')}
          </option>
          {selected?.Workspaces?.filter(
            (w) => !w.archived && (allowed(environment, w.id) || w.id === workspace),
          ).map((w) => (
            <option key={w.id} value={w.id} disabled={!allowed(environment, w.id)}>
              {w.key || w.cwd || w.id}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export function EnvironmentWorkspaces({
  environment,
  onSaved,
}: {
  environment: Environment;
  onSaved: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState('');
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState(environment.Spec.Roots?.[0] || '');
  return (
    <details className="environment-workspaces">
      <summary>
        {t('Workspaces')} · {environment.Workspaces?.filter((w) => !w.archived).length || 0}
      </summary>
      {environment.Workspaces?.filter((w) => !w.archived).map((w) => (
        <div className="list-row" key={w.id}>
          <span>
            <strong>{w.key || w.id}</strong>
            <small>{w.cwd}</small>
          </span>
          <button
            className="text-button"
            aria-label={`${t('Archive workspace')}: ${w.key || w.id}`}
            onClick={() => setArchiving(w.id)}
          >
            {t('Archive')}
          </button>
        </div>
      ))}
      {archiving && (
        <Form
          key={archiving}
          label={t('Archive workspace')}
          submit={async () => {
            await api(
              `/api/v1/environments/${encode(environment.ID)}/workspaces/${encode(archiving)}/archive`,
              { method: 'POST', body: '{}' },
            );
            setArchiving('');
            await onSaved();
          }}
          secondary={
            <button type="button" className="text-button" onClick={() => setArchiving('')}>
              {t('Cancel')}
            </button>
          }
        >
          <p>
            {t('Archive workspace')} ·{' '}
            {environment.Workspaces?.find((w) => w.id === archiving)?.key || archiving}
          </p>
          <p>
            {t('This hides the workspace from new selections. Files and existing chats are kept.')}
          </p>
        </Form>
      )}
      {adding ? (
        <Form
          label={t('Create workspace')}
          submit={async () => {
            await api(`/api/v1/environments/${encode(environment.ID)}/workspaces`, {
              method: 'POST',
              body: JSON.stringify({
                key: name.includes('/') ? name.trim() : `kites/${name.trim()}`,
                cwd,
              }),
            });
            setAdding(false);
            setName('');
            await onSaved();
          }}
        >
          <Field label={t('Workspace name')}>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('Folder in environment')}>
            <input required value={cwd} onChange={(e) => setCwd(e.target.value)} />
          </Field>
          <button type="button" className="text-button" onClick={() => setAdding(false)}>
            {t('Cancel')}
          </button>
        </Form>
      ) : (
        <button className="text-button" onClick={() => setAdding(true)}>
          + {t('Create workspace')}
        </button>
      )}
    </details>
  );
}
