import { BotSessions } from './BotSessions';
import { ChatRow } from './ChatRow';
import { activityTime } from './reading';
import { runtimeChoice, chooseRuntime } from './api';
import { IconPicker, readIcon, presets } from './AgentIcon';
import { WorkspaceBadge, ChatWorkspaceEditor } from './WorkspaceAccess';
import { WorkspacePicker, EnvironmentWorkspaces } from './Environments';
import { t, useLanguage, setLanguagePreference, type LanguagePreference } from './i18n';
import { AgentIconProfiles } from './AgentIcon';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  Download,
  FileText,
  Folder,
  LayoutGrid,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Users,
  Wifi,
  Cable,
  Briefcase,
  Sun,
  Moon,
  Pin,
  X,
} from 'lucide-react';
import {
  agentName,
  api,
  configureConnection,
  connection,
  createSession,
  encode,
  errorText,
  getProduct,
  getReading,
  isNative,
  listAgents,
  listEnvironments,
  listSessions,
  memberName,
  saveProduct,
  updateAgent,
} from './api';
import { AgentForm, EnvironmentForm, PluginForm } from './AgentForms';
import { Conversation, Markdown } from './Conversation';
import { RoutineForm, Routines } from './Routines';
import {
  Avatar,
  DateLabel,
  download,
  Empty,
  Field,
  Form,
  Modal,
  PageHeading,
  SearchInput,
  Status,
} from './ui';
import type {
  AgentRecord,
  Environment,
  ProductState,
  ReadingSummary,
  Routine,
  SavedFile,
  Session,
} from './types';

type View = 'chats' | 'agents' | 'work' | 'routines' | 'plugins' | 'library' | 'settings' | 'more';
type Dialog =
  | { kind: 'agent'; agent?: AgentRecord }
  | { kind: 'chat'; bot?: AgentRecord; group?: boolean }
  | { kind: 'routine'; routine?: Routine }
  | { kind: 'plugin'; agent?: AgentRecord; index?: number }
  | { kind: 'file'; file: SavedFile }
  | { kind: 'details'; session: Session }
  | { kind: 'environment' }
  | { kind: 'search' }
  | { kind: 'confirm'; title: string; description: string; action: () => Promise<void> };
const initial: ProductState = { routines: [], runs: [], files: [], chats: [], runtime: '' };
const nav = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'agents', label: 'Bots', icon: Users },
  { id: 'routines', label: 'Routines', icon: CalendarClock },
  { id: 'plugins', label: 'Plugins', icon: Cable },
  { id: 'library', label: 'Library', icon: BookOpen },
] as const;
function readRoute() {
  const [view, id] = location.hash.slice(1).split('/');
  return {
    view: ([
      'chats',
      'agents',
      'work',
      'routines',
      'plugins',
      'library',
      'settings',
      'more',
    ].includes(view)
      ? view
      : 'chats') as View,
    id: id ? decodeURIComponent(id) : undefined,
  };
}
export default function App() {
  const { preference } = useLanguage();
  const [languageError, setLanguageError] = useState('');
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [showSystemEnvironments, setShowSystemEnvironments] = useState(false);
  const [product, setProduct] = useState(initial);
  const [reading, setReading] = useState<Record<string, ReadingSummary>>({});
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  // Connection errors come back on every refresh, so `error` can be cleared by
  // the next poll. A failed action is reported once and must stay on screen
  // until the user dismisses it.
  const [alert, setAlert] = useState('');
  const [starting, setStarting] = useState('');
  const [dialog, setDialog] = useState<Dialog>();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [workFilter, setWorkFilter] = useState('All');
  const [settingsSection, setSettingsSection] = useState('Appearance');
  const [theme, setTheme] = useState(localStorage.getItem('kites.theme') || 'light');
  const [refreshing, setRefreshing] = useState(false);
  const desktop = new URLSearchParams(location.search).has('desktop');
  useEffect(() => {
    const update = () => {
      setRoute(readRoute());
      setSearch('');
    };
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kites.theme', theme);
  }, [theme]);
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      listAgents(),
      listSessions(),
      listEnvironments(),
      getProduct(),
    ]);
    const [a, s, e, p] = results;
    if (a.status === 'fulfilled') setAgents(a.value);
    if (s.status === 'fulfilled') {
      setSessions(s.value);
      for (let offset = 0; offset < s.value.length; offset += 100) {
        const summaries = await getReading(
          s.value.slice(offset, offset + 100).map((session) => session.id),
        ).catch(() => null);
        if (summaries) setReading((old) => ({ ...old, ...summaries }));
      }
    }
    if (e.status === 'fulfilled') setEnvironments(e.value);
    if (p.status === 'fulfilled') setProduct(p.value);
    const failed = results.find((r) => r.status === 'rejected');
    setConnected(!failed);
    if (failed?.status === 'rejected') setError(errorText(failed.reason));
    else setError('');
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const resume = () => {
      void refresh();
    };
    window.addEventListener('kites:resume', resume);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('kites:resume', resume);
    };
  }, [refresh]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setDialog({ kind: 'search' });
      }
    };
    addEventListener('keydown', listener);
    return () => removeEventListener('keydown', listener);
  }, []);
  const navigate = (view: View, id?: string) => {
    location.hash = `${view}${id ? `/${encode(id)}` : ''}`;
  };
  const saved = async () => {
    await refresh();
    setDialog(undefined);
  };
  const title = (s: Session) =>
    product.chats.find((c) => c.id === s.id)?.title ||
    (s.key?.startsWith('kites/') ? undefined : s.key) ||
    (s.agents || []).map(memberName).join(' & ') ||
    t('Chat');
  const selected = sessions.find((s) => s.id === route.id);
  const status = (s: Session) => {
    const states = (s.agents || []).map((a) => a.status);
    return states.includes('waiting_permission')
      ? 'needs attention'
      : states.some((v) => ['running', 'starting'].includes(v))
        ? 'running'
        : states.includes('failed')
          ? 'failed'
          : s.status === 'closed'
            ? 'closed'
            : 'ready';
  };
  const matches = (value: string) => value.toLowerCase().includes(search.toLowerCase());
  const visibleSessions = sessions.filter(
    (s) => !product.chats.find((c) => c.id === s.id)?.archived,
  );
  const filteredSessions = sessions
    .filter(
      (s) =>
        !!product.chats.find((c) => c.id === s.id)?.archived === showArchived && matches(title(s)),
    )
    .sort(
      (a, b) =>
        Number(!!product.chats.find((c) => c.id === b.id)?.pinned) -
        Number(!!product.chats.find((c) => c.id === a.id)?.pinned),
    );
  async function startChat(
    ids: string[],
    name: string,
    place?: { environment: string; workspace: string },
  ) {
    const session = await createSession(ids, name, place);
    await refresh();
    setSessions((old) => (old.some((s) => s.id === session.id) ? old : [session, ...old]));
    setDialog(undefined);
    navigate('chats', session.id);
  }
  // Creating a chat can take minutes when a sandbox has to boot. Mark the bot
  // that is starting so its button reports progress instead of looking inert.
  function startChatFrom(a: AgentRecord) {
    if (starting) return;
    setStarting(a.ID);
    setAlert('');
    void startChat([a.ID], agentName(a))
      .catch((e) => setAlert(errorText(e)))
      .finally(() => setStarting(''));
  }
  function confirm(title: string, description: string, action: () => Promise<void>) {
    setDialog({
      kind: 'confirm',
      title,
      description,
      action: async () => {
        await action();
        await refresh();
        setDialog(undefined);
      },
    });
  }
  const chatInfo = (s: Session) => product.chats.find((c) => c.id === s.id);
  async function changeChat(s: Session, change: { archived?: boolean; pinned?: boolean }) {
    await saveProduct('chats', { ...chatInfo(s), id: s.id, title: title(s), ...change });
    if (change.archived && route.id === s.id) navigate('chats');
    await refresh();
  }
  function deleteChat(s: Session) {
    confirm(
      'Delete chat?',
      'This permanently deletes this chat and its runtime history.',
      async () => {
        await api(`/api/v1/sessions/${encode(s.id)}`, { method: 'DELETE' });
        await api(`/api/kites/chats/${encode(s.id)}`, { method: 'DELETE' });
        if (route.id === s.id) navigate('chats');
      },
    );
  }
  const chatActions = (s: Session) => ({
    label: title(s),
    archived: chatInfo(s)?.archived,
    pinned: chatInfo(s)?.pinned,
    onArchive: () => changeChat(s, { archived: !chatInfo(s)?.archived }),
    onPin: () => changeChat(s, { pinned: !chatInfo(s)?.pinned }),
    onDelete: () => deleteChat(s),
    onDetails: () => setDialog({ kind: 'details', session: s }),
  });
  const pluginRows = agents.flatMap((agent) =>
    (agent.Spec.MCP || []).map((server, index) => ({ agent, server, index })),
  );
  return (
    <AgentIconProfiles.Provider value={Object.fromEntries(agents.map((a) => [a.ID, a.Spec]))}>
      <div
        className={`app ${desktop ? 'desktop-app' : ''} ${selected && route.view === 'chats' ? 'has-conversation' : ''}`}
      >
        <aside className="sidebar">
          <div className="window-drag" />
          <button className="brand" onClick={() => navigate('chats')}>
            <img src="/kite.svg" alt="" />
            <span>Kites</span>
          </button>
          <button className="sidebar-search" onClick={() => setDialog({ kind: 'search' })}>
            <Search size={16} />
            <span>{t('Search anything')}</span>
            <kbd>{'⌘ K'}</kbd>
          </button>
          <nav>
            {nav.map((item) => (
              <button
                key={item.id}
                className={route.view === item.id ? 'active' : ''}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span>{t(item.label)}</span>
                {item.id === 'work' && sessions.some((s) => status(s) === 'needs attention') && (
                  <span className="nav-dot" />
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-section">
            <span>{t('Your chats')}</span>
            <button aria-label={t('New chat')} onClick={() => setDialog({ kind: 'chat' })}>
              <Plus size={16} />
            </button>
          </div>
          <div className="sidebar-chats">
            <BotSessions
              sessions={[...visibleSessions].sort(
                (a, b) =>
                  Number(!!chatInfo(b)?.pinned) - Number(!!chatInfo(a)?.pinned) ||
                  (Date.parse(reading[b.id]?.updatedAt || '') || 0) -
                    (Date.parse(reading[a.id]?.updatedAt || '') || 0),
              )}
              bots={agents}
              active={route.id}
              compact
              onNew={(bot, group) => setDialog({ kind: 'chat', bot, group })}
            >
              {(s) => (
                <ChatRow key={s.id} compact {...chatActions(s)}>
                  <button
                    className={route.id === s.id ? 'active' : ''}
                    onClick={() => navigate('chats', s.id)}
                  >
                    <span className="sidebar-chat-title">
                      {title(s)}
                      <WorkspaceBadge session={s} environments={environments} workspaceOnly />
                    </span>
                    {reading[s.id]?.unread > 0 && (
                      <span className="unread-dot" aria-label={t('Unread messages')} />
                    )}
                    {product.chats.find((c) => c.id === s.id)?.pinned && <Pin size={12} />}
                  </button>
                </ChatRow>
              )}
            </BotSessions>
            {!sessions.length && <p>{t('Your chats will feel at home here.')}</p>}
          </div>
          <div className="sidebar-bottom">
            <button
              onClick={() => navigate('settings')}
              className={route.view === 'settings' ? 'active' : ''}
            >
              <span className="account-avatar">{t('You')}</span>
              <span>
                {t('Your space')}
                <small>
                  <i className={connected ? 'online' : ''} />
                  {connected ? t('Connected') : t('Not connected')}
                </small>
              </span>
              <Settings size={17} />
            </button>
          </div>
        </aside>
        <main className="main">
          {!selected && (
            <header className="mobile-header">
              <button className="brand" onClick={() => navigate('chats')}>
                <img src="/kite.svg" alt="" />
                <span>Kites</span>
              </button>
              <button
                className="icon-button"
                aria-label={t('Search')}
                onClick={() => setDialog({ kind: 'search' })}
              >
                <Search size={20} />
              </button>
            </header>
          )}
          {error && (
            <div className="connection-banner" role="alert">
              <Wifi size={17} />
              <span title={error}>{t(error)}</span>
              <button onClick={() => navigate('settings')}>{t('Connection')}</button>
              <button
                className="icon-button"
                aria-label={t('Retry connection')}
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          )}
          {alert && (
            <div className="connection-banner" role="alert">
              <TriangleAlert size={17} />
              <span title={alert}>{t(alert)}</span>
              <button
                className="icon-button"
                aria-label={t('Dismiss')}
                onClick={() => setAlert('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-page">
              <img src="/kite.svg" width="40" />
              <LoaderCircle className="spin" size={20} />
              <p>{t('Opening your space…')}</p>
            </div>
          ) : route.view === 'chats' && selected ? (
            <Conversation
              key={selected.id}
              session={selected}
              environments={environments}
              title={title(selected)}
              avatar={product.chats.find((c) => c.id === selected.id)?.avatar}
              onBack={() => navigate('chats')}
              onDetails={() => setDialog({ kind: 'details', session: selected })}
              onSaved={refresh}
            />
          ) : route.view === 'chats' ? (
            <div className="page chats-page">
              <PageHeading
                title={t('Chats')}
                description={t('A thought, a task, a little help. Start here.')}
                action={
                  <button className="primary" onClick={() => setDialog({ kind: 'chat' })}>
                    <Plus size={17} />
                    {t('New chat')}
                  </button>
                }
              />
              {!agents.length ? (
                <div className="onboarding-card">
                  <div className="onboarding-art">
                    {[presets[1], presets[0], presets[2]].map((preset) => (
                      <Avatar key={preset.name} name={preset.name} icon={preset.icon} size="hero" />
                    ))}
                  </div>
                  <h2>{t('Who will you create first?')}</h2>
                  <p>
                    {t('A research partner. A thoughtful planner. An extra pair of hands.')}
                    <br />
                    {t('Give your bot a name and make it yours.')}
                  </p>
                  <button
                    className="primary"
                    disabled={!connected}
                    onClick={() => setDialog({ kind: 'agent' })}
                  >
                    {t('Create your first bot')}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="section-heading">
                    <h2>{t('Your bots')}</h2>
                    <button onClick={() => navigate('agents')}>
                      {t('View all')}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="agent-strip">
                    {agents.slice(0, 5).map((a) => (
                      <button key={a.ID} disabled={!!starting} onClick={() => startChatFrom(a)}>
                        <Avatar spec={a.Spec} name={agentName(a)} size="large" />
                        <strong>{agentName(a)}</strong>
                        <small>
                          {starting === a.ID
                            ? t('Starting…')
                            : a.Spec.Metadata?.['kites.role'] || a.Spec.Kind}
                        </small>
                      </button>
                    ))}
                    <button className="add-agent-tile" onClick={() => setDialog({ kind: 'agent' })}>
                      <span className="avatar large add">
                        <Plus size={22} />
                      </span>
                      <strong>{t('New bot')}</strong>
                      <small>{t('Make it yours')}</small>
                    </button>
                  </div>
                </>
              )}
              {(sessions.length > 0 || agents.length > 0) && (
                <>
                  <div className="section-heading">
                    <div className="chat-list-tabs" aria-label={t('Chats')}>
                      <button aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>
                        {t('Chats')}
                      </button>
                      <button aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
                        {t('Archived')}
                      </button>
                    </div>
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={t('Find a chat')}
                    />
                  </div>
                  {filteredSessions.length ? (
                    <div className="chat-list">
                      <BotSessions
                        sessions={[...filteredSessions].sort(
                          (a, b) =>
                            Number(!!chatInfo(b)?.pinned) - Number(!!chatInfo(a)?.pinned) ||
                            (Date.parse(reading[b.id]?.updatedAt || '') || 0) -
                              (Date.parse(reading[a.id]?.updatedAt || '') || 0),
                        )}
                        bots={agents}
                        onNew={(bot, group) => setDialog({ kind: 'chat', bot, group })}
                      >
                        {(s) => (
                          <ChatRow key={s.id} {...chatActions(s)}>
                            <button
                              className="chat-list-row"
                              onClick={() => navigate('chats', s.id)}
                            >
                              <Avatar
                                state={status(s)}
                                icon={
                                  readIcon(product.chats.find((c) => c.id === s.id)?.avatar) ||
                                  undefined
                                }
                                spec={s.agents?.[0]?.spec}
                                name={memberName(s.agents?.[0])}
                              />
                              <span className="grow">
                                <strong>{title(s)}</strong>
                                <small>
                                  {reading[s.id]?.preview
                                    ? t(reading[s.id].preview)
                                    : (s.agents || []).map(memberName).join(', ')}
                                </small>
                                <WorkspaceBadge session={s} environments={environments} />
                              </span>
                              <span className="chat-row-meta">
                                <time dateTime={reading[s.id]?.updatedAt}>
                                  {activityTime(reading[s.id]?.updatedAt)}
                                </time>
                                {reading[s.id]?.unread > 0 && (
                                  <span className="unread-dot" aria-label={t('Unread messages')} />
                                )}
                                {chatInfo(s)?.pinned && <Pin size={13} aria-label={t('Pinned')} />}
                                {status(s) !== 'ready' && <Status value={status(s)} />}
                              </span>
                            </button>
                          </ChatRow>
                        )}
                      </BotSessions>
                    </div>
                  ) : (
                    <div className="quiet-empty">
                      <MessageCircle size={22} />
                      <p>
                        {search
                          ? t('No chats match your search.')
                          : showArchived
                            ? t('No archived chats.')
                            : t('Your next good idea starts with a chat.')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : route.view === 'agents' ? (
            <div className="page">
              <PageHeading
                eyebrow={t('A team that feels like yours')}
                title={t('Your bots')}
                description={t('Different strengths. A shared space.')}
                action={
                  <button
                    className="primary"
                    disabled={!connected}
                    onClick={() => setDialog({ kind: 'agent' })}
                  >
                    <Plus size={17} />
                    {t('Create bot')}
                  </button>
                }
              />
              <SearchInput value={search} onChange={setSearch} placeholder={t('Find a bot')} />
              {agents.length ? (
                <div className="agent-grid">
                  {agents
                    .filter((a) => matches(agentName(a) + ' ' + a.Spec.Metadata?.['kites.role']))
                    .map((a) => (
                      <article className="agent-card" key={a.ID}>
                        <button
                          className="agent-card-profile"
                          onClick={() => setDialog({ kind: 'agent', agent: a })}
                        >
                          <Avatar spec={a.Spec} name={agentName(a)} size="hero" />
                          <h2>{agentName(a)}</h2>
                          <p>{a.Spec.Metadata?.['kites.role'] || t('Ready to lend a hand')}</p>
                        </button>
                        <p className="agent-description">
                          {a.Spec.Instructions || t('A fresh perspective, ready when you are.')}
                        </p>
                        <div className="agent-card-footer">
                          <span>{a.Spec.Kind}</span>
                          <button disabled={!!starting} onClick={() => startChatFrom(a)}>
                            {starting === a.ID ? <LoaderCircle size={16} className="spin" /> : null}
                            {starting === a.ID ? t('Starting…') : t('Chat')}
                            {starting === a.ID ? null : <ArrowUpRight size={16} />}
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty
                  icon={<Users />}
                  title={t('A name makes it personal.')}
                  action={
                    <button
                      className="primary"
                      disabled={!connected}
                      onClick={() => setDialog({ kind: 'agent' })}
                    >
                      {t('Create a bot')}
                    </button>
                  }
                >
                  {t('Build a small team around the way you work.')}
                </Empty>
              )}
            </div>
          ) : route.view === 'routines' ? (
            <Routines
              routines={product.routines}
              runs={product.runs}
              agents={agents}
              onNew={() => setDialog({ kind: 'routine' })}
              onEdit={(routine) => setDialog({ kind: 'routine', routine })}
              onOpen={(id) => navigate('chats', id)}
              onRefresh={refresh}
              onError={setAlert}
            />
          ) : route.view === 'work' ? (
            <div className="page">
              <PageHeading
                eyebrow={t('A little progress, every day')}
                title={t('Work')}
                description={t('What your bots are working on, all in one place.')}
              />
              <div className="tabs">
                {['All', 'Running', 'Needs attention', 'Ready'].map((v) => (
                  <button
                    className={workFilter === v ? 'selected' : ''}
                    key={v}
                    onClick={() => setWorkFilter(v)}
                  >
                    {t(v)}
                  </button>
                ))}
              </div>
              {sessions.filter(
                (s) => workFilter === 'All' || status(s) === workFilter.toLowerCase(),
              ).length ? (
                <div className="list">
                  {sessions
                    .filter((s) => workFilter === 'All' || status(s) === workFilter.toLowerCase())
                    .map((s) => (
                      <button
                        className="list-row work-row"
                        key={s.id}
                        onClick={() => navigate('chats', s.id)}
                      >
                        <Avatar
                          state={status(s)}
                          icon={
                            readIcon(product.chats.find((c) => c.id === s.id)?.avatar) || undefined
                          }
                          spec={s.agents?.[0]?.spec}
                          name={memberName(s.agents?.[0])}
                        />
                        <span className="grow">
                          <strong>{title(s)}</strong>
                          <small>{(s.agents || []).map(memberName).join(', ')}</small>
                          <WorkspaceBadge session={s} environments={environments} />
                        </span>
                        <Status value={status(s)} />
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
              ) : (
                <Empty icon={<Briefcase />} title={t('Nothing waiting on you.')}>
                  {t('Your bots’ chats and active work will appear here.')}
                </Empty>
              )}
            </div>
          ) : route.view === 'plugins' ? (
            <div className="page">
              <PageHeading
                eyebrow={t('A little more capable')}
                title={t('Plugins')}
                description={t('Connect your bots to the tools you use.')}
                action={
                  <button
                    className="primary"
                    disabled={!agents.length}
                    onClick={() => setDialog({ kind: 'plugin' })}
                  >
                    <Plus size={17} />
                    {t('Connect plugin')}
                  </button>
                }
              />
              <div className="plugin-intro">
                <div className="feature-icon">
                  <Cable size={26} />
                </div>
                <div>
                  <h2>{t('Your tools. Your bots.')}</h2>
                  <p>
                    {t('Bring an MCP server into a bot’s workspace.')}
                    <br />
                    {t('Choose exactly which bot gets access.')}
                  </p>
                </div>
                <span className="tag">MCP</span>
              </div>
              <div className="section-heading">
                <h2>
                  {t('Connected plugins')}
                  <span className="count">{pluginRows.length}</span>
                </h2>
                <SearchInput value={search} onChange={setSearch} placeholder={t('Find a plugin')} />
              </div>
              {pluginRows.length ? (
                <div className="plugin-grid">
                  {pluginRows
                    .filter((p) => matches(p.server.Name + ' ' + agentName(p.agent)))
                    .map(({ agent, server, index }) => (
                      <button
                        className="plugin-card"
                        key={`${agent.ID}:${index}`}
                        onClick={() => setDialog({ kind: 'plugin', agent, index })}
                      >
                        <span className="plugin-symbol">
                          <Cable size={23} />
                        </span>
                        <h2>{server.Name}</h2>
                        <p>
                          {server.URL
                            ? new URL(server.URL).hostname
                            : server.Command || t('MCP server')}
                        </p>
                        <div>
                          <span className="agent-label">
                            <Avatar spec={agent.Spec} name={agentName(agent)} size="tiny" />
                            {agentName(agent)}
                          </span>
                          <ChevronRight size={16} />
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty
                  icon={<Cable />}
                  title={t('Give your bot a new skill.')}
                  action={
                    <button
                      className="primary"
                      disabled={!agents.length}
                      onClick={() => setDialog({ kind: 'plugin' })}
                    >
                      {t('Connect an MCP server')}
                    </button>
                  }
                >
                  {t('Add a remote server or a local command.')}
                  {!agents.length ? t(' Create a bot first.') : ''}
                </Empty>
              )}
            </div>
          ) : route.view === 'library' ? (
            <div className="page">
              <PageHeading
                eyebrow={t('Good work, kept close')}
                title={t('Library')}
                description={t('The responses and documents you chose to keep.')}
              />
              <SearchInput value={search} onChange={setSearch} placeholder={t('Find a file')} />
              {product.files.length ? (
                <div className="file-grid">
                  {product.files
                    .filter((f) => matches(f.name + ' ' + f.content))
                    .map((f) => (
                      <button
                        className="file-card"
                        key={f.id}
                        onClick={() => setDialog({ kind: 'file', file: f })}
                      >
                        <div className="file-preview">
                          <FileText size={20} />
                          <p>{f.content.slice(0, 240)}</p>
                        </div>
                        <h3>{f.name}</h3>
                        <small>
                          <DateLabel time={f.updatedAt} />
                        </small>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty icon={<BookOpen />} title={t('Keep the good stuff.')}>
                  {t('Save a response from any chat. It’ll be here when you need it.')}
                </Empty>
              )}
            </div>
          ) : route.view === 'more' ? (
            <div className="page">
              <PageHeading title={t('Your space')} />
              {[
                ...nav.filter((n) => ['routines', 'plugins', 'library'].includes(n.id)),
                { id: 'settings' as const, label: 'Settings', icon: Settings },
              ].map((n) => (
                <button className="list-row" key={n.id} onClick={() => navigate(n.id)}>
                  <n.icon size={21} />
                  <strong className="grow">{t(n.label)}</strong>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : route.view === 'settings' ? (
            <div className="page settings-page">
              <PageHeading title={t('Settings')} description={t('Make yourself at home.')} />
              <nav className="settings-navigation" aria-label={t('Settings')}>
                {['Appearance', 'Environments', 'Connection'].map((section) => (
                  <button
                    key={section}
                    aria-pressed={settingsSection === section}
                    onClick={() => setSettingsSection(section)}
                  >
                    {t(section)}
                  </button>
                ))}
              </nav>
              <section className="settings-section" hidden={settingsSection !== 'Appearance'}>
                <h2>{t('Language')}</h2>
                <Field
                  label={t('Display language')}
                  hint={t(
                    'Uses your device language. English is used when the language is not supported.',
                  )}
                >
                  <select
                    aria-label={t('Display language')}
                    value={preference}
                    disabled={savingLanguage}
                    onChange={(event) => {
                      setLanguageError('');
                      setSavingLanguage(true);
                      void setLanguagePreference(event.target.value as LanguagePreference)
                        .catch(() =>
                          setLanguageError('Language could not be saved. Please try again.'),
                        )
                        .finally(() => setSavingLanguage(false));
                    }}
                  >
                    <option value="system">{t('Follow system')}</option>
                    <option value="en" lang="en">
                      English
                    </option>
                    <option value="zh-CN" lang="zh-CN">
                      简体中文
                    </option>
                  </select>
                </Field>
                <p className="muted">
                  {t(
                    'The interface language changes immediately. Bot names, messages, and documents stay as written.',
                  )}
                </p>
                {languageError && (
                  <p className="inline-error" role="alert">
                    {t(languageError)}
                  </p>
                )}
              </section>
              <section className="settings-section" hidden={settingsSection !== 'Appearance'}>
                <h2>{t('Appearance')}</h2>
                <div className="theme-options">
                  {[
                    { id: 'light', icon: Sun, label: 'Light' },
                    { id: 'dark', icon: Moon, label: 'Dark' },
                  ].map((themeOption) => (
                    <button
                      key={themeOption.id}
                      className={theme === themeOption.id ? 'selected' : ''}
                      onClick={() => setTheme(themeOption.id)}
                    >
                      <div className={`theme-preview ${themeOption.id}`}>
                        <span />
                        <i />
                        <i />
                      </div>
                      <span>
                        <themeOption.icon size={15} />
                        {t(themeOption.label)}
                        {theme === themeOption.id && <Check size={15} />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="settings-section" hidden={settingsSection !== 'Connection'}>
                <h2>{t('Connection')}</h2>
                <ConnectionForm onSaved={refresh} />
                <div className="runtime-state">
                  <i className={connected ? 'online' : ''} />
                  <span>
                    {connected ? t('Connected to Agentway') : t('Agentway is unavailable')}
                    <small>
                      {product.runtime || t('Set AGENTWAY_URL when starting the Kites service.')}
                    </small>
                  </span>
                  <button
                    className="icon-button"
                    disabled={refreshing}
                    aria-label={t('Refresh connection')}
                    onClick={() => {
                      setRefreshing(true);
                      void refresh().finally(() => setRefreshing(false));
                    }}
                  >
                    <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
                  </button>
                </div>
              </section>
              <section className="settings-section" hidden={settingsSection !== 'Environments'}>
                <div className="section-heading">
                  <h2>{t('Environments')}</h2>
                  <button disabled={!connected} onClick={() => setDialog({ kind: 'environment' })}>
                    <Plus size={16} />
                    {t('Add')}
                  </button>
                </div>
                {product.alphaAvailable && (
                  <Field
                    label={t('Runtime connection')}
                    hint={t(
                      'Each connection keeps its own bots, chats, routines, and environments.',
                    )}
                  >
                    <select value={runtimeChoice()} onChange={(e) => chooseRuntime(e.target.value)}>
                      <option value="local">{t('Local runtime')}</option>
                      <option value="alpha">{t('Alpha · cloud environments')}</option>
                    </select>
                  </Field>
                )}
                {environments
                  .filter((e) => e.Key || e.Workspaces?.length || showSystemEnvironments)
                  .map((e) => (
                    <div key={e.ID}>
                      <div className="list-row">
                        <Folder size={19} />
                        <span className="grow">
                          <strong>{e.Key || e.ID}</strong>
                          <small>
                            {e.Spec.Kind} · {(e.Spec.Roots || []).join(', ')}
                          </small>
                        </span>
                        <button
                          className="icon-button"
                          aria-label={t('Delete environment {name}', { name: e.Key || e.ID })}
                          onClick={() =>
                            confirm(
                              'Delete environment?',
                              'Existing bots may still reference this environment. The runtime will reject deletion if it is in use.',
                              async () => {
                                await api(`/api/v1/environments/${encode(e.ID)}`, {
                                  method: 'DELETE',
                                });
                              },
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <EnvironmentWorkspaces environment={e} onSaved={refresh} />
                    </div>
                  ))}
                {environments.some((e) => !e.Key && !e.Workspaces?.length) && (
                  <button
                    className="text-button"
                    onClick={() => setShowSystemEnvironments(!showSystemEnvironments)}
                  >
                    {t(
                      showSystemEnvironments
                        ? 'Hide runtime-created environments'
                        : 'Show runtime-created environments',
                    )}
                  </button>
                )}
                {!environments.length && (
                  <p className="muted">
                    {t('Use the runtime’s default workspace, or add a folder for your bots.')}
                  </p>
                )}
              </section>
              <section className="settings-section about">
                <img src="/kite.svg" width="34" />
                <h2>
                  Kites <span>0.1.0</span>
                </h2>
                <p>
                  {t('Your bots, working together.')}
                  <br />
                  {t('Powered by Agentway.')}
                </p>
              </section>
            </div>
          ) : null}
        </main>
        <nav className="bottom-nav">
          {[
            { id: 'chats', label: 'Chats', icon: MessageCircle },
            { id: 'work', label: 'Work', icon: Briefcase },
            { id: 'agents', label: 'Bots', icon: Users },
            { id: 'more', label: 'More', icon: LayoutGrid },
          ].map((n) => (
            <button
              key={n.id}
              className={
                route.view === n.id ||
                (n.id === 'more' &&
                  ['routines', 'plugins', 'library', 'settings'].includes(route.view))
                  ? 'active'
                  : ''
              }
              onClick={() => navigate(n.id as View)}
            >
              <n.icon size={21} />
              <span>{t(n.label)}</span>
            </button>
          ))}
        </nav>
        {dialog && (
          <Modal
            title={
              dialog.kind === 'agent'
                ? dialog.agent
                  ? t('Bot profile')
                  : t('Create bot')
                : dialog.kind === 'chat'
                  ? t('New chat')
                  : dialog.kind === 'routine'
                    ? dialog.routine
                      ? t('Routine details')
                      : t('New routine')
                    : dialog.kind === 'plugin'
                      ? t('Plugin connection')
                      : dialog.kind === 'file'
                        ? dialog.file.name
                        : dialog.kind === 'details'
                          ? t('Chat details')
                          : dialog.kind === 'environment'
                            ? t('New environment')
                            : dialog.kind === 'search'
                              ? t('Search your space')
                              : t(dialog.title)
            }
            onClose={() => setDialog(undefined)}
            wide={dialog.kind === 'file'}
          >
            {dialog.kind === 'agent' ? (
              <>
                <AgentForm agent={dialog.agent} environments={environments} onSaved={saved} />
                {dialog.agent && (
                  <button
                    className="danger-link"
                    onClick={() => {
                      const agent = dialog.agent!;
                      confirm(
                        t('Delete {name}?', { name: agentName(agent) }),
                        'This removes the bot from Agentway. Chats are kept, but routines using this bot will fail.',
                        async () => {
                          await api(`/api/v1/agents/${encode(agent.ID)}`, { method: 'DELETE' });
                        },
                      );
                    }}
                  >
                    <Trash2 size={16} />
                    {t('Delete bot')}
                  </button>
                )}
              </>
            ) : dialog.kind === 'chat' ? (
              <NewChat
                initialBot={dialog.bot}
                initialGroup={dialog.group}
                agents={agents}
                environments={environments}
                onStart={startChat}
                onCreate={() => setDialog({ kind: 'agent' })}
              />
            ) : dialog.kind === 'routine' ? (
              <>
                <RoutineForm routine={dialog.routine} agents={agents} onSaved={saved} />
                {dialog.routine && (
                  <button
                    className="danger-link"
                    onClick={() => {
                      const id = dialog.routine!.id;
                      confirm(
                        'Delete routine?',
                        'This stops future scheduled runs. Its chats and run history are kept.',
                        async () => {
                          await api(`/api/kites/routines/${encode(id)}`, { method: 'DELETE' });
                        },
                      );
                    }}
                  >
                    <Trash2 size={16} />
                    {t('Delete routine')}
                  </button>
                )}
              </>
            ) : dialog.kind === 'plugin' ? (
              <>
                <PluginForm
                  agents={agents}
                  initialAgent={dialog.agent}
                  index={dialog.index}
                  server={
                    dialog.index !== undefined ? dialog.agent?.Spec.MCP?.[dialog.index] : undefined
                  }
                  onSaved={saved}
                />
                {dialog.agent && dialog.index !== undefined && (
                  <button
                    className="danger-link"
                    onClick={() => {
                      const { agent, index } = dialog;
                      confirm(
                        'Remove plugin?',
                        'This removes the server from this bot. Existing chats keep their current configuration.',
                        async () => {
                          const current = await api<AgentRecord>(
                            `/api/v1/agents/${encode(agent!.ID)}`,
                          );
                          await updateAgent(current, {
                            ...current.Spec,
                            MCP: current.Spec.MCP?.filter((_, i) => i !== index),
                          });
                        },
                      );
                    }}
                  >
                    <Trash2 size={16} />
                    {t('Remove plugin')}
                  </button>
                )}
              </>
            ) : dialog.kind === 'file' ? (
              <>
                <div className="file-toolbar">
                  <button
                    className="subtle-button"
                    onClick={() => {
                      void download(dialog.file.name, dialog.file.content).catch((e) =>
                        setAlert(errorText(e)),
                      );
                    }}
                  >
                    <Download size={16} />
                    {t('Download')}
                  </button>
                  {dialog.file.sessionId && (
                    <button
                      className="subtle-button"
                      onClick={() => {
                        navigate('chats', dialog.file.sessionId);
                        setDialog(undefined);
                      }}
                    >
                      {t('Open chat')}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={t('Delete file')}
                    onClick={() => {
                      const id = dialog.file.id;
                      confirm(
                        'Delete saved file?',
                        'This removes the saved copy. The original chat is kept.',
                        async () => {
                          await api(`/api/kites/files/${encode(id)}`, { method: 'DELETE' });
                        },
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <Markdown>{dialog.file.content}</Markdown>
              </>
            ) : dialog.kind === 'environment' ? (
              <EnvironmentForm onSaved={saved} />
            ) : dialog.kind === 'details' ? (
              <ConversationDetails
                session={sessions.find((s) => s.id === dialog.session.id) || dialog.session}
                environments={environments}
                bots={agents}
                onRefresh={refresh}
                title={title(dialog.session)}
                avatar={product.chats.find((c) => c.id === dialog.session.id)?.avatar}
                pinned={product.chats.find((c) => c.id === dialog.session.id)?.pinned || false}
                onSaved={saved}
                onArchive={() =>
                  changeChat(dialog.session, {
                    archived: !chatInfo(dialog.session)?.archived,
                  }).then(() => setDialog(undefined))
                }
                archived={chatInfo(dialog.session)?.archived}
                onDelete={() => deleteChat(dialog.session)}
              />
            ) : dialog.kind === 'search' ? (
              <GlobalSearch
                agents={agents}
                sessions={visibleSessions}
                title={title}
                onAgent={(agent) => setDialog({ kind: 'agent', agent })}
                onSession={(id) => {
                  navigate('chats', id);
                  setDialog(undefined);
                }}
              />
            ) : dialog.kind === 'confirm' ? (
              <>
                <p className="confirm-copy">{t(dialog.description)}</p>
                <Form
                  label={t('Delete')}
                  submit={dialog.action}
                  secondary={
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => setDialog(undefined)}
                    >
                      {t('Cancel')}
                    </button>
                  }
                >
                  {null}
                </Form>
              </>
            ) : null}
          </Modal>
        )}
      </div>
    </AgentIconProfiles.Provider>
  );
}
function NewChat({
  initialGroup = false,
  initialBot,
  agents,
  environments,
  onStart,
  onCreate,
}: {
  initialGroup?: boolean;
  initialBot?: AgentRecord;
  agents: AgentRecord[];
  environments: Environment[];
  onStart: (
    ids: string[],
    title: string,
    place?: { environment: string; workspace: string },
  ) => Promise<void>;
  onCreate: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(initialBot ? [initialBot.ID] : []);
  const [group, setGroup] = useState(initialGroup);
  const [environment, setEnvironment] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [name, setName] = useState('');
  return agents.length ? (
    <Form
      label={t('Start chat')}
      submit={async () => {
        if (!chosen.length) throw new Error('Choose at least one bot.');
        if (group && chosen.length < 2)
          throw new Error('Choose at least two bots for a group chat.');
        await onStart(
          chosen,
          name.trim() ||
            agents
              .filter((a) => chosen.includes(a.ID))
              .map(agentName)
              .join(' & '),
          { environment, workspace },
        );
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={!group ? 'selected' : ''}
          onClick={() => {
            setGroup(false);
            setChosen(chosen.slice(0, 1));
          }}
        >
          {t('New Chat')}
        </button>
        <button type="button" className={group ? 'selected' : ''} onClick={() => setGroup(true)}>
          {t('Group Chat')}
        </button>
      </div>
      <p className="muted form-intro">
        {t(group ? 'Choose two or more bots to work together.' : 'Choose a bot to start a chat.')}
      </p>
      <div className="choose-agents">
        {agents.map((a) => (
          <label key={a.ID}>
            <Avatar spec={a.Spec} name={agentName(a)} />
            <span className="grow">
              <strong>{agentName(a)}</strong>
              <small>{a.Spec.Metadata?.['kites.role'] || a.Spec.Kind}</small>
            </span>
            <input
              type="checkbox"
              checked={chosen.includes(a.ID)}
              onChange={(e) =>
                setChosen(
                  e.target.checked
                    ? group
                      ? [...chosen, a.ID]
                      : [a.ID]
                    : chosen.filter((id) => id !== a.ID),
                )
              }
            />
          </label>
        ))}
      </div>
      <WorkspacePicker
        environments={environments}
        bots={agents.filter((a) => chosen.includes(a.ID)).map((a) => a.Spec)}
        environment={environment}
        workspace={workspace}
        onChange={(env, ws) => {
          setEnvironment(env);
          setWorkspace(ws);
        }}
      />
      <Field label={t('Chat name (optional)')}>
        <input
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          placeholder={chosen.length > 1 ? t('e.g. A fresh idea') : t('A new chat')}
        />
      </Field>
    </Form>
  ) : (
    <Empty
      icon={<Users />}
      title={t('Start with a bot.')}
      action={
        <button className="primary" onClick={onCreate}>
          {t('Create bot')}
        </button>
      }
    >
      {t('Give your first bot a name, then say hello.')}
    </Empty>
  );
}
function ConnectionForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(connection);
  return (
    <Form
      label={t('Connect')}
      submit={async () => {
        configureConnection(value);
        await api('/api/v1/health');
        await onSaved();
      }}
    >
      {isNative && (
        <Field
          label={t('Kites server')}
          hint={t('Use the HTTPS address of your Kites service, not the Agentway port.')}
        >
          <input
            type="url"
            required
            placeholder="https://kites.example.com"
            value={value.endpoint}
            onChange={(e) => setValue({ ...value, endpoint: e.target.value })}
          />
        </Field>
      )}
      <Field
        label={t('Access key')}
        hint={t('Needed for a shared server. Local desktop connections are handled for you.')}
      >
        <input
          type="password"
          autoComplete="off"
          value={value.token}
          onChange={(e) => setValue({ ...value, token: e.target.value })}
          placeholder={t('Kites access key')}
        />
      </Field>
    </Form>
  );
}
function ConversationDetails({
  avatar,
  session,
  title,
  pinned,
  environments,
  bots,
  onRefresh,
  onSaved,
  onDelete,
  onArchive,
  archived,
}: {
  onArchive: () => Promise<void>;
  archived?: boolean;
  session: Session;
  title: string;
  pinned: boolean;
  environments: Environment[];
  bots: AgentRecord[];
  onRefresh: () => Promise<void>;
  avatar?: string;
  onSaved: () => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(title);
  const [pin, setPin] = useState(pinned);
  const [icon, setIcon] = useState(() => readIcon(avatar));
  return (
    <>
      <Form
        submit={async () => {
          await saveProduct('chats', {
            id: session.id,
            title: name,
            pinned: pin,
            kind: session.agents.length > 1 ? 'group' : 'chat',
            avatar: icon ? JSON.stringify(icon) : '',
          });
          await onSaved();
        }}
      >
        <Field label={t('Name')}>
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <details className="form-details">
          <summary>{t('Task avatar')}</summary>
          <IconPicker value={icon} onChange={setIcon} />
        </details>
        <label className="check-row">
          <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
          {t('Pin chat')}
        </label>
      </Form>
      <h3 className="subheading">{t('Workspace')}</h3>
      <ChatWorkspaceEditor
        session={session}
        environments={environments}
        bots={session.agents.map(
          (m) => bots.find((b) => b.ID === m.spec.Metadata?.['kites.profile'])?.Spec || m.spec,
        )}
        onSaved={onSaved}
        onRefresh={onRefresh}
      />
      <h3 className="subheading">{t('Members')}</h3>
      {(session.agents || []).map((a) => (
        <div className="list-row" key={a.id}>
          <Avatar spec={a?.spec} name={memberName(a)} />
          <span className="grow">
            <strong>{memberName(a)}</strong>
            <small>{a.spec.Kind}</small>
          </span>
          <Status value={a.status} />
        </div>
      ))}
      <p className="notice">
        {t('Create a new group chat to choose a different set of existing bots.')}
      </p>
      <Form submit={onArchive} label={t(archived ? 'Restore chat' : 'Archive chat')}>
        <p className="notice">{t('Archived chats keep their history and can be restored.')}</p>
      </Form>
      <button className="danger-link" onClick={onDelete}>
        <Trash2 size={16} />
        {t('Delete chat')}
      </button>
    </>
  );
}
function GlobalSearch({
  agents,
  sessions,
  title,
  onAgent,
  onSession,
}: {
  agents: AgentRecord[];
  sessions: Session[];
  title: (s: Session) => string;
  onAgent: (a: AgentRecord) => void;
  onSession: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const matches = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder={t('Find bots and chats')} />
      <h3 className="subheading">{t('Bots')}</h3>
      {agents
        .filter((a) => matches(agentName(a)))
        .map((a) => (
          <button key={a.ID} className="list-row" onClick={() => onAgent(a)}>
            <Avatar spec={a.Spec} name={agentName(a)} size="tiny" />
            <span>{agentName(a)}</span>
          </button>
        ))}
      <h3 className="subheading">{t('Chats')}</h3>
      {sessions
        .filter((s) => matches(title(s)))
        .map((s) => (
          <button key={s.id} className="list-row" onClick={() => onSession(s.id)}>
            <MessageCircle size={16} />
            <span>{title(s)}</span>
          </button>
        ))}
    </>
  );
}
