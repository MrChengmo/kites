import { WorkspaceAccessEditor, workspaceAccess } from './WorkspaceAccess';
import { workspaceAccessKey, workspaceMode } from '../shared/workspaceAccess.mjs';
import { WorkspacePicker } from './Environments';
import { t } from './i18n';
import { IconPicker, iconKey, kitePresets, readIcon } from './AgentIcon';
import { useState } from 'react';
import { Cable, Code2 } from 'lucide-react';
import { agentName, api, createAgent, encode, updateAgent, runtimeChoice } from './api';
import type { AgentRecord, Environment, MCPServer } from './types';
import { Avatar, Field, Form } from './ui';
export function AgentForm({
  agent,
  environments,
  onSaved,
}: {
  agent?: AgentRecord;
  environments: Environment[];
  onSaved: () => Promise<void>;
}) {
  const [icon, setIcon] = useState(() =>
    agent ? readIcon(agent.Spec.Metadata?.[iconKey]) : kitePresets[0].icon,
  );
  const [name, setName] = useState(agent ? agentName(agent) : '');
  const [role, setRole] = useState(agent?.Spec.Metadata?.['kites.role'] || '');
  const [kind, setKind] = useState(agent?.Spec.Kind || 'codex');
  const [model, setModel] = useState(agent?.Spec.Model || '');
  const [instructions, setInstructions] = useState(agent?.Spec.Instructions || '');
  const [context, setContext] = useState(agent?.Spec.SystemPrompt || '');
  const [environment, setEnvironment] = useState(agent?.Spec.EnvironmentID || '');
  const [access, setAccess] = useState(() => workspaceAccess(agent?.Spec));
  const [workspace, setWorkspace] = useState(agent?.Spec.Metadata?.['kites.workspace'] || '');
  return (
    <>
      <div className="profile-preview">
        <Avatar icon={icon} name={name || t('Your bot')} size="large" />
        <h2>{name || t('Your bot')}</h2>
        <p>{role || t('A little help, your way.')}</p>
      </div>
      <Form
        label={agent ? t('Save changes') : t('Create bot')}
        submit={async () => {
          if (access.restricted)
            workspaceMode(
              {
                Kind: kind,
                MCP: agent?.Spec.MCP,
                Metadata: { [workspaceAccessKey]: JSON.stringify(access) },
              },
              { environment, workspace },
            );
          // No Environment means "Bot default". On alpha the control pod runs no
          // agent provider, so a bare bot fails with "agent provider not
          // registered". A spec lets alpha create the sandbox and place the bot.
          const spec = {
            ...agent?.Spec,
            Kind: kind,
            Model: model,
            Instructions: instructions,
            SystemPrompt: context,
            EnvironmentID: environment,
            EnvironmentSpec: environment
              ? undefined
              : agent?.Spec.EnvironmentSpec ||
                (runtimeChoice() === 'alpha' ? { Kind: 'miaoda', Roots: [] } : undefined),
            Host: environment
              ? environments.find((e) => e.ID === environment)?.Spec.Host
              : agent?.Spec.Host,
            Metadata: {
              ...agent?.Spec.Metadata,
              'kites.name': name.trim(),
              'kites.role': role,
              'kites.workspace': workspace,
              [workspaceAccessKey]: JSON.stringify(access),
              [iconKey]: icon ? JSON.stringify(icon) : '',
            },
          };
          if (agent) await updateAgent(agent, spec);
          else await createAgent({ ...spec, Key: `kites/${crypto.randomUUID()}` });
          await onSaved();
        }}
      >
        <IconPicker value={icon} onChange={setIcon} />
        <div className="form-grid">
          <Field label={t('Name')}>
            <input
              required
              maxLength={60}
              placeholder={t('e.g. Maya')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('A short description')}>
            <input
              maxLength={140}
              placeholder={t('Research partner')}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={t('Instructions')}
          hint={t(
            'Used for new chats and future routine runs. Include the tone and approach you prefer.',
          )}
        >
          <textarea
            rows={5}
            placeholder={t('Be curious, concise, and careful with sources.')}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
        <details className="form-details">
          <summary>{t('Model & environment')}</summary>
          <div className="form-grid">
            <Field label={t('Provider')}>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {['codex', 'claudecode', 'opencode', 'goose', 'grok', 'loom'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
                {!['codex', 'claudecode', 'opencode', 'goose', 'grok', 'loom'].includes(kind) && (
                  <option>{kind}</option>
                )}
              </select>
            </Field>
            <Field label={t('Model')} hint={t('Leave blank to use the provider default.')}>
              <input
                value={model}
                placeholder={t('Provider default')}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>
          </div>
          <p className="muted small">
            {t('The provider must be installed and signed in on your Agentway host.')}
          </p>
        </details>
        <details className="form-details">
          <summary>{t('Workspace & access')}</summary>
          <WorkspaceAccessEditor value={access} onChange={setAccess} environments={environments} />
          <h3 className="subheading">{t('Default workspace')}</h3>
          <WorkspacePicker
            environments={environments}
            bots={[{ Kind: kind, Metadata: { [workspaceAccessKey]: JSON.stringify(access) } }]}
            environment={environment}
            workspace={workspace}
            onChange={(env, ws) => {
              setEnvironment(env);
              setWorkspace(ws);
            }}
          />
        </details>
        <details className="form-details">
          <summary>{t('Persistent context')}</summary>
          <Field
            label={t('Context')}
            hint={t(
              'Saved with this bot and sent as its system prompt. Add preferences or background it should always know.',
            )}
          >
            <textarea
              rows={6}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={t('What should your bot know about you?')}
            />
          </Field>
        </details>
      </Form>
    </>
  );
}
export function PluginForm({
  agents,
  initialAgent,
  server,
  index,
  onSaved,
}: {
  agents: AgentRecord[];
  initialAgent?: AgentRecord;
  server?: MCPServer;
  index?: number;
  onSaved: () => Promise<void>;
}) {
  const [agentId, setAgentId] = useState(initialAgent?.ID || agents[0]?.ID || '');
  const [name, setName] = useState(server?.Name || '');
  const [transport, setTransport] = useState(server?.Command ? 'command' : 'url');
  const [url, setURL] = useState(server?.URL || '');
  const [command, setCommand] = useState(server?.Command || '');
  const [args, setArgs] = useState(JSON.stringify(server?.Args || [], null, 2));
  const [env, setEnv] = useState(JSON.stringify(server?.Env || {}, null, 2));
  return (
    <>
      <div className="feature-intro">
        <div className="feature-icon">
          <Cable size={25} />
        </div>
        <h2>{t('Give your bot more to work with.')}</h2>
        <p>{t('Connect an MCP server to bring its tools into your bot’s chats.')}</p>
      </div>
      <Form
        label={server ? t('Save connection') : t('Connect plugin')}
        submit={async () => {
          const record = await api<AgentRecord>(`/api/v1/agents/${encode(agentId)}`);
          const mcp = [...(record.Spec.MCP || [])];
          const variables = JSON.parse(env);
          if (
            !variables ||
            typeof variables !== 'object' ||
            Array.isArray(variables) ||
            Object.values(variables).some((v) => typeof v !== 'string')
          )
            throw new Error('Environment variables must be a JSON object of strings.');
          const item: MCPServer = { Name: name.trim() };
          if (transport === 'url') {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol))
              throw new Error('Enter an HTTP or HTTPS server URL.');
            item.URL = url;
          } else {
            const list = JSON.parse(args);
            if (!Array.isArray(list) || list.some((v) => typeof v !== 'string'))
              throw new Error('Arguments must be a JSON array of strings.');
            item.Command = command;
            item.Args = list;
          }
          item.Env = variables;
          if (mcp.some((v, i) => v.Name === item.Name && i !== index))
            throw new Error('This bot already has a plugin with that name.');
          if (index !== undefined) mcp[index] = item;
          else mcp.push(item);
          await updateAgent(record, { ...record.Spec, MCP: mcp });
          await onSaved();
        }}
      >
        <Field label={t('Bot')}>
          <select
            required
            disabled={!!server}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.ID} value={a.ID}>
                {agentName(a)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Plugin name')}>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('e.g. My workspace')}
          />
        </Field>
        <div className="segmented">
          <button
            type="button"
            className={transport === 'url' ? 'selected' : ''}
            onClick={() => setTransport('url')}
          >
            <Cable size={15} />
            {t('Remote server')}
          </button>
          <button
            type="button"
            className={transport === 'command' ? 'selected' : ''}
            onClick={() => setTransport('command')}
          >
            <Code2 size={15} />
            {t('Local command')}
          </button>
        </div>
        {transport === 'url' ? (
          <Field label={t('Server URL')}>
            <input
              type="url"
              required
              placeholder="https://your-server.example/mcp"
              value={url}
              onChange={(e) => setURL(e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field
              label={t('Command')}
              hint={t('Runs on the Agentway host with the bot’s access.')}
            >
              <input
                required
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('npx')}
              />
            </Field>
            <Field label={t('Arguments (JSON)')}>
              <textarea rows={3} value={args} onChange={(e) => setArgs(e.target.value)} />
            </Field>
          </>
        )}
        <details className="form-details">
          <summary>{t('Environment variables')}</summary>
          <Field
            label={t('Variables (JSON)')}
            hint={t('Stored by Agentway with this bot. Use host-managed secrets where possible.')}
          >
            <textarea
              rows={4}
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              spellCheck={false}
            />
          </Field>
        </details>
        <p className="notice">
          {t(
            'Connecting gives this bot access to the server’s tools. Changes apply to new chats and future routine runs.',
          )}
        </p>
      </Form>
    </>
  );
}
export function EnvironmentForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [key, setKey] = useState('');
  const [root, setRoot] = useState('');
  const [kind, setKind] = useState(runtimeChoice() === 'alpha' ? 'miaoda' : 'local');
  const [image, setImage] = useState('');
  return (
    <Form
      label={t('Add environment')}
      submit={async () => {
        await api('/api/v1/environments', {
          method: 'POST',
          body: JSON.stringify({
            Key: key,
            Kind: kind,
            Roots: root ? [root] : [],
            ...(image ? { Image: image } : {}),
          }),
        });
        await onSaved();
      }}
    >
      <Field label={t('Name')}>
        <input
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('Personal workspace')}
        />
      </Field>
      <Field label={t('Execution location')}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {runtimeChoice() === 'local' ? (
            <option value="local">{t('This host')}</option>
          ) : (
            <>
              <option value="miaoda">{t('Miaoda sandbox')}</option>
              <option value="e2b">{t('E2B sandbox')}</option>
            </>
          )}
        </select>
      </Field>
      {['miaoda', 'e2b'].includes(kind) && (
        <>
          <Field
            label={t('Sandbox template')}
            hint={t('Leave blank to use the template configured on alpha.')}
          >
            <input value={image} onChange={(e) => setImage(e.target.value)} />
          </Field>
          <p className="notice">
            {t(
              'Connect to alpha with a configured sandbox provider. The sandbox starts when a bot needs it.',
            )}
          </p>
        </>
      )}
      <Field
        label={t('Folder on the Agentway host')}
        hint={t('Bots in this environment can work with this folder.')}
      >
        <input
          required={kind === 'local'}
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          placeholder="/absolute/path/to/workspace"
          pattern="/.*"
        />
      </Field>
    </Form>
  );
}
