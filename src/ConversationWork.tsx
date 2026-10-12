import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  LoaderCircle,
  Terminal,
  X,
} from 'lucide-react';
import { memberName } from './api';
import { textContent, type Entry } from './events';
import { Markdown, ContentImages } from './ConversationContent';
import { Avatar, download } from './ui';
import type { MemberAgent, PlanTask, RuntimeEvent } from './types';
import {
  nativeItem,
  plans,
  toolLabel,
  toolStatus,
  workers,
  workFiles,
  type WorkGroup,
  type Worker,
} from './work';
function Steps({ tasks }: { tasks: PlanTask[] }) {
  return (
    <ol className="work-steps">
      {tasks.map((task, index) => (
        <li key={task.id}>
          <span className={`step-mark ${task.status}`}>
            {task.status === 'completed' ? <Check size={11} /> : index + 1}
          </span>
          <div>
            {task.title}
            {task.items?.length ? <Steps tasks={task.items} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
function ToolDetail({ entry, events }: { entry: Entry; events: RuntimeEvent[] }) {
  const status = toolStatus(entry, events);
  const item = nativeItem(entry);
  const content = textContent(entry.payload.content);
  return (
    <details className="work-tool">
      <summary>
        {status === 'running' ? (
          <LoaderCircle size={13} className="spin" />
        ) : status === 'completed' ? (
          <Check size={13} />
        ) : (
          <Terminal size={13} />
        )}
        <span>{t(toolLabel(entry))}</span>
        <small>{status === 'completed' ? '' : t(status)}</small>
      </summary>
      <div className="work-tool-body">
        {typeof item.command === 'string' && <pre>{item.command}</pre>}
        {content && <pre>{content}</pre>}
        {typeof entry.payload.error === 'string' && entry.payload.error && (
          <p className="inline-error">{entry.payload.error}</p>
        )}
        <ContentImages content={entry.payload.content} />
        <details className="raw-event">
          <summary>{t('Input and result')}</summary>
          <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
        </details>
      </div>
    </details>
  );
}
function Activity({ group, events }: { group: WorkGroup; events: RuntimeEvent[] }) {
  return (
    <div className="work-activity-list">
      {group.entries.map((entry) =>
        entry.kind === 'tool' ? (
          <ToolDetail key={entry.id} entry={entry} events={events} />
        ) : entry.kind === 'thinking' ? (
          <details className="work-thought" key={entry.id}>
            <summary>
              {t('Thinking update')}
              {entry.pending && <LoaderCircle className="spin" size={12} />}
            </summary>
            <Markdown>{entry.text}</Markdown>
          </details>
        ) : null,
      )}
    </div>
  );
}
export function WorkCard({
  group,
  events,
  members,
  open,
}: {
  group: WorkGroup;
  events: RuntimeEvent[];
  members: MemberAgent[];
  open: () => void;
}) {
  const currentPlans = plans(group);
  const tasks = currentPlans.flatMap((plan) => plan.tasks);
  const done = tasks.filter((task) => task.status === 'completed').length;
  const active = tasks.find((task) => task.status === 'in_progress');
  const collaborators = workers(group);
  const tools = group.entries.filter((e) => e.kind === 'tool');

  return (
    <section className="conversation-work">
      <details className="activity-fold">
        <summary>
          <ChevronDown size={13} />
          <span>
            {tools.length
              ? t(tools.length === 1 ? 'Used {count} tool' : 'Used {count} tools', {
                  count: tools.length,
                })
              : t('Thinking through the task')}
          </span>
          <small>
            {tools.length
              ? t(tools.length === 1 ? '{count} activity' : '{count} activities', {
                  count: tools.length,
                })
              : t('View updates')}
          </small>
        </summary>
        <Activity group={group} events={events} />
      </details>
      {!!tasks.length && (
        <details className="work-plan-card">
          <summary>
            <span className="plan-ring">
              {done === tasks.length ? <Check size={13} /> : <span>{done}</span>}
            </span>
            <div>
              <strong>
                {active?.title || t(done === tasks.length ? 'Plan complete' : 'Work plan')}
              </strong>
              <small>{t('{done} / {total} steps complete', { done, total: tasks.length })}</small>
            </div>
            <ChevronDown size={14} />
          </summary>
          <div className="inline-work-plan">
            {currentPlans.map((plan) => (
              <div key={plan.agentId}>
                {currentPlans.length > 1 && (
                  <p>{memberName(members.find((m) => m.id === plan.agentId))}</p>
                )}
                <Steps tasks={plan.tasks} />
              </div>
            ))}
          </div>
        </details>
      )}
      {!!collaborators.length && (
        <button className="collaboration-link" onClick={open}>
          <GitBranch size={14} />
          {t(collaborators.length === 1 ? '{count} collaborator' : '{count} collaborators', {
            count: collaborators.length,
          })}
          <span>{t('View work →')}</span>
        </button>
      )}
    </section>
  );
}
export function WorkPanel({
  group,
  events,
  members,
  close,
  initialFile,
}: {
  group?: WorkGroup;
  events: RuntimeEvent[];
  members: MemberAgent[];
  close: () => void;
  initialFile?: string | null;
}) {
  const [tab, setTab] = useState('overview');
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(initialFile || null);
  const [error, setError] = useState('');
  const root = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    setWorkerId(null);
    setFileId(initialFile || null);
    if (initialFile) setTab('files');
    setError('');
  }, [group?.id, initialFile]);
  const collaborators = group ? workers(group) : [];
  const files = group ? workFiles(group) : [];
  const worker = collaborators.find((w) => w.id === workerId);
  const file = files.find((f) => f.id === fileId);
  const currentPlans = group ? plans(group) : [];
  const agents = members.filter((m) => group?.entries.some((e) => e.agentId === m.id));
  function workerRow(w: Worker) {
    return (
      <button
        className="work-worker"
        aria-label={t('Open {name} task', { name: w.name })}
        key={w.id}
        onClick={() => setWorkerId(w.id)}
      >
        <Avatar name={w.name} size="tiny" />
        <span>
          <strong>{w.name}</strong>
          <small>{w.prompt || t('Delegated task')}</small>
        </span>
        <small>{t(w.status)}</small>
      </button>
    );
  }
  return (
    <aside
      className="work-panel"
      aria-label={t('Work details')}
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
        if (e.key === 'Tab' && window.innerWidth <= 760) {
          const focusable = [
            ...(root.current?.querySelectorAll<HTMLElement>(
              'button, a[href], summary, input, textarea',
            ) || []),
          ].filter((el) => el.getClientRects().length);
          const first = focusable[0],
            last = focusable.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header>
        <h2>{t('Work details')}</h2>
        <button
          ref={closeButton}
          className="icon-button"
          aria-label={t('Close work details')}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="work-tabs" role="tablist" aria-label={t('Work views')}>
        {['overview', 'activity', 'files'].map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => {
              setTab(name);
              setWorkerId(null);
              setFileId(null);
              setError('');
            }}
          >
            {t(name[0].toUpperCase() + name.slice(1))}
          </button>
        ))}
      </div>
      <div
        className="work-panel-body"
        role="tabpanel"
        aria-label={t(tab[0].toUpperCase() + tab.slice(1))}
      >
        {!group ? (
          <p className="work-empty">
            {t('Plans, tool activity, and files appear here as your bot works.')}
          </p>
        ) : worker ? (
          <>
            <button className="work-back" onClick={() => setWorkerId(null)}>
              <ArrowLeft size={13} />
              {t('Back to overview')}
            </button>
            <h3>{worker.name}</h3>
            <span className="work-badge">{t(worker.status)}</span>
            <h4>{t('Assignment')}</h4>
            <Markdown>
              {worker.prompt || t('No assignment text was included in this event.')}
            </Markdown>
            <h4>{t('Returned summary')}</h4>
            <Markdown>
              {worker.result || t('No result has been returned in the parent chat.')}
            </Markdown>
            <h4>{t('Delegation activity')}</h4>
            {worker.calls.map((e) => (
              <ToolDetail key={e.id} entry={e} events={events} />
            ))}
            <p className="work-note">
              {t(
                'Shows the parent’s delegation record. Internal child tool activity is only available when the provider shares it.',
              )}
            </p>
          </>
        ) : file ? (
          <>
            <button className="work-back" onClick={() => setFileId(null)}>
              <ArrowLeft size={13} />
              {t('Back to files')}
            </button>
            <h3>{file.name}</h3>
            <p className="work-note">
              {t(file.format)} {t('· captured from the completed tool result')}
            </p>
            {file.format === 'File content' && /\.md$/i.test(file.name) ? (
              <Markdown>{file.content}</Markdown>
            ) : (
              <pre className="file-preview">{file.content}</pre>
            )}
            <button
              className="primary"
              onClick={() => {
                void download(
                  file.format === 'File content' ? file.name : `${file.name}.diff`,
                  file.content,
                ).catch((e) => setError(e.message));
              }}
            >
              {t(file.format === 'File content' ? 'Download snapshot' : 'Download changes')}
            </button>
            {error && (
              <p className="inline-error" role="alert">
                {t(error)}
              </p>
            )}
          </>
        ) : tab === 'activity' ? (
          <>
            <h3>{t('What happened')}</h3>
            <Activity group={group} events={events} />
          </>
        ) : tab === 'files' ? (
          <>
            <h3>{t('Files from this work')}</h3>
            {files.length ? (
              files.map((f) => (
                <button
                  key={f.id}
                  aria-label={t('Preview {name}', { name: f.name })}
                  className="work-file"
                  onClick={() => setFileId(f.id)}
                >
                  <FileText size={22} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>{t(f.format)}</small>
                  </span>
                  <span>↗</span>
                </button>
              ))
            ) : (
              <p className="work-empty">
                {t(
                  'No file content was included in the completed tool results. You can save a bot response from the chat.',
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="work-section-label">{t('THIS WORK')}</div>
            <h3>
              {currentPlans.flatMap((p) => p.tasks).find((t) => t.status === 'in_progress')
                ?.title || t('A closer look at the work')}
            </h3>
            {agents.map((m) => (
              <div key={m.id} className="work-owner">
                <Avatar name={memberName(m)} spec={m.spec} size="tiny" />
                <span>{memberName(m)}</span>
              </div>
            ))}
            <h4>{t('Plan')}</h4>
            {currentPlans.length ? (
              currentPlans.map((plan) => (
                <div key={plan.agentId}>
                  {currentPlans.length > 1 && (
                    <p>{memberName(members.find((m) => m.id === plan.agentId))}</p>
                  )}
                  <Steps tasks={plan.tasks} />
                </div>
              ))
            ) : (
              <p className="work-empty">{t('This bot has not shared a structured plan.')}</p>
            )}
            {!!collaborators.length && (
              <>
                <h4>{t('Collaborators')}</h4>
                {collaborators.map(workerRow)}
                <details className="work-flow">
                  <summary>
                    <GitBranch size={14} />
                    {t('Workflow')}
                  </summary>
                  {agents.map((m) => (
                    <div key={m.id}>
                      <div className="flow-parent">{memberName(m)}</div>
                      <div className="flow-children">
                        {collaborators
                          .filter((w) => w.parent === m.id)
                          .map((w) => (
                            <button key={w.id} onClick={() => setWorkerId(w.id)}>
                              ↓<strong>{w.name}</strong>
                              <small>{t(w.status)}</small>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </details>
              </>
            )}
            <h4>{t('Activity')}</h4>
            <button className="work-see-all" onClick={() => setTab('activity')}>
              {t('{count} tool calls', {
                count: group.entries.filter((e) => e.kind === 'tool').length,
              })}
              <span>{t('View activity →')}</span>
            </button>
            {!!files.length && (
              <>
                <h4>{t('Files')}</h4>
                {files.map((f) => (
                  <button
                    key={f.id}
                    aria-label={t('Preview {name}', { name: f.name })}
                    className="work-file"
                    onClick={() => {
                      setTab('files');
                      setFileId(f.id);
                    }}
                  >
                    <FileText size={19} />
                    <span>
                      <strong>{f.name}</strong>
                      <small>{t(f.format)}</small>
                    </span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
