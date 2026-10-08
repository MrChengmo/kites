import { useReading } from './useReading';
import { dayLabel, messageTime } from './reading';
import {
  imageTypes,
  mentionedRecipients,
  prepareAttachments,
  readAttachments,
  type Attachment,
} from './attachments';
import { WorkspaceBadge } from './WorkspaceAccess';
import { readIcon } from './AgentIcon';
import { t, locale } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  PanelRight,
  Reply,
  Copy,
  Download,
  FileText,
  MoreHorizontal,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Paperclip,
  Folder,
  Plus,
  Square,
  X,
} from 'lucide-react';
import { Markdown, ContentImages, UserContent } from './ConversationContent';
export { Markdown } from './ConversationContent';
import { memberName, saveProduct } from './api';
import { projectEvents, transcript, type Entry } from './events';
import { useConversation } from './useConversation';
import type { Environment, Session } from './types';
import { Avatar, download, Modal } from './ui';
import { Question } from './ConversationQuestion';
import { WorkCard, WorkPanel } from './ConversationWork';
import { groupWork, workFiles, type WorkGroup } from './work';
import './conversation.css';
export function Conversation({
  session,
  environments = [],
  avatar,
  title,
  onBack,
  onDetails,
  onSaved,
}: {
  session: Session;
  environments?: Environment[];
  avatar?: string;
  title: string;
  onBack: () => void;
  onDetails: () => void;
  onSaved: () => Promise<void>;
}) {
  const { events, loading, sending, error, submit, interrupt, retry } = useConversation(session.id);
  const entries = useMemo(() => projectEvents(events), [events]);
  const finalMessages = useMemo(() => {
    const last = new Map<string, string>();
    for (const entry of entries)
      if (entry.kind === 'assistant') last.set(`${entry.agentId}:${entry.turnId}`, entry.id);
    return new Set(last.values());
  }, [entries]);
  const blocks = useMemo(() => groupWork(entries), [entries]);
  const pendingQuestion = entries.find((entry) => entry.kind === 'ask' && entry.pending);
  const [panel, setPanel] = useState<string | null>(null);
  const [quote, setQuote] = useState('');
  const [panelFile, setPanelFile] = useState<string | null>(null);
  const workGroups = blocks.filter((block): block is WorkGroup => block.kind === 'work');
  const selectedWork = workGroups.find((group) => group.id === panel) || workGroups.at(-1);
  const [draft, setDraft] = useState('');
  const [expandedComposer, setExpandedComposer] = useState(false);
  const [composerActions, setComposerActions] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [readingFiles, setReadingFiles] = useState(false);
  const attachQueue = useRef(Promise.resolve());
  const attachedRef = useRef<Attachment[]>([]);
  const currentSession = useRef(session.id);
  currentSession.current = session.id;

  const [target, setTarget] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  attachedRef.current = images;
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [hideMentions, setHideMentions] = useState(false);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [nearBottom, setNearBottom] = useState(true);
  const [menu, setMenu] = useState(false);
  const positioned = useRef('');
  const scroll = useRef<HTMLDivElement>(null);
  const composerWrap = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(100);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const reading = useReading(session.id, events, loading, scroll);
  const firstUnread = blocks.find(
    (block) =>
      block.kind !== 'work' && block.seq && reading.boundary && block.seq >= reading.boundary,
  )?.id;
  const members = session.agents || [];
  const mentioned = mentionedRecipients(draft, members);
  const mention = !hideMentions && draft.slice(0, caret).match(/(?:^|\s)@([^@\n]{0,40})$/u);
  const suggestions = mention
    ? members.filter((m) =>
        memberName(m).toLocaleLowerCase().includes(mention[1].toLocaleLowerCase()),
      )
    : [];
  function chooseMention(id: string) {
    const member = members.find((m) => m.id === id);
    if (!member || !mention) return;
    const start = caret - mention[1].length - 1;
    const next = draft.slice(0, start) + '@' + memberName(member) + ' ' + draft.slice(caret);
    setDraft(next);
    sessionStorage.setItem(`kites.draft.${session.id}`, next);
    setHideMentions(true);
    const position = start + memberName(member).length + 2;
    setCaret(position);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(position, position);
    });
  }
  const statuses = new Map(members.map((member) => [member.id, member.status]));
  for (const event of events)
    if (event.agent_id && event.payload.type === 'status')
      statuses.set(event.agent_id, event.payload.status || 'idle');
  const stopped =
    events.filter((event) => event.agent_id && event.payload.type === 'status').at(-1)?.payload
      .status === 'cancelled';
  const busy =
    sending ||
    uploading ||
    readingFiles ||
    [...statuses.values()].some((value) => ['running', 'starting', 'blocked'].includes(value));
  useEffect(() => {
    setDraft(sessionStorage.getItem(`kites.draft.${session.id}`) || '');
    setImages([]);
    setLocalError('');
    setTarget('');
    setPanel(null);
    setPanelFile(null);
    setQuote('');
    setNearBottom(true);
    setMenu(false);
    setComposerActions(false);
    setPreview(null);
    setExpandedComposer(false);
    positioned.current = '';
  }, [session.id]);
  useEffect(() => {
    if (!reading.ready || reading.failure || loading || !scroll.current) return;
    const element = scroll.current;
    if (positioned.current !== session.id) {
      positioned.current = session.id;
      const unread = element.querySelector<HTMLElement>('.new-divider');
      if (unread) {
        element.scrollTo({ top: unread.offsetTop - 20, behavior: 'instant' });
        setNearBottom(false);
      } else element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
    } else if (nearBottom) element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
  }, [entries, reading.ready, reading.failure, loading, nearBottom, session.id]);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(expandedComposer ? 420 : 180, Math.max(expandedComposer ? 260 : 40, textarea.current.scrollHeight))}px`;
  }, [draft, expandedComposer]);
  useEffect(() => {
    if (!composerWrap.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setComposerHeight(composerWrap.current?.offsetHeight || 100),
    );
    observer.observe(composerWrap.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.conversation-header')) setMenu(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menu]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function sendMessage() {
    if (busy || (!draft.trim() && !images.length)) return;
    const quoted = quote;
    const text = quote
      ? `${quote
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}\n\n${draft}`
      : draft;
    setQuote('');
    setNearBottom(true);
    const attached = images;
    const mentions = mentionedRecipients(draft, members);
    const to = mentions.length
      ? mentions
      : target === 'all'
        ? members.map((a) => a.id)
        : target
          ? [target]
          : [];
    setUploading(true);
    setDraft('');
    setImages([]);
    sessionStorage.removeItem(`kites.draft.${session.id}`);
    setLocalError('');
    try {
      const prepared = await prepareAttachments(session, attached, to);
      setUploading(false);
      await submit({
        text: text + prepared.references,
        images: prepared.images?.length ? prepared.images : undefined,
        to: to.length ? to : undefined,
      });
    } catch (error) {
      setLocalError((error as Error).message);
      setQuote(quoted);
      setDraft((current) => {
        const restored = current || draft;
        sessionStorage.setItem(`kites.draft.${session.id}`, restored);
        return restored;
      });
      setImages((current) => (current.length ? [...attached, ...current] : attached));
    } finally {
      setUploading(false);
    }
  }
  async function attach(files: FileList | File[] | null) {
    if (!files?.length) return;
    const added = Array.from(files);
    const sid = session.id;
    setReadingFiles(true);
    attachQueue.current = attachQueue.current.then(async () => {
      if (sid !== currentSession.current) return;
      setLocalError('');
      try {
        const next = await readAttachments(added, attachedRef.current);
        if (sid === currentSession.current) {
          attachedRef.current = next;
          setImages(next);
        }
      } catch (e) {
        if (sid === currentSession.current) setLocalError((e as Error).message);
      }
    });
    const pending = attachQueue.current;
    await pending;
    if (pending === attachQueue.current) setReadingFiles(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  function insertMention() {
    const input = textarea.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const prefix = draft.slice(0, start);
    const inserted = (prefix && !/\s$/.test(prefix) ? ' ' : '') + '@';
    const next = prefix + inserted + draft.slice(end);
    setDraft(next);
    sessionStorage.setItem(`kites.draft.${session.id}`, next);
    setCaret(start + inserted.length);
    setHideMentions(false);
    setMentionIndex(0);
    setComposerActions(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }
  async function saveAnswer(entry: Entry) {
    try {
      await saveProduct('files', {
        name: `${title.slice(0, 70)}.md`,
        content: entry.text,
        sessionId: session.id,
      });
      await onSaved();
      setNotice('Saved to your library');
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }
  return (
    <div
      className={`conversation-layout ${panel ? 'has-work-panel' : ''} ${members.length > 1 ? 'group-chat' : 'single-bot'}`}
    >
      <div className="conversation">
        <header className="conversation-header">
          <button
            className="icon-button mobile-only"
            aria-label={t('Back to chats')}
            onClick={onBack}
          >
            <ArrowLeft size={21} />
          </button>
          <div className="conversation-person" onClick={onDetails}>
            <div className="avatar-stack">
              {readIcon(avatar) ? (
                <Avatar icon={readIcon(avatar)} name={title} state={busy ? 'working' : 'idle'} />
              ) : (
                members
                  .slice(0, 3)
                  .map((a) => (
                    <Avatar
                      key={a.id}
                      spec={a?.spec}
                      name={memberName(a)}
                      state={statuses.get(a.id)}
                    />
                  ))
              )}
              {members.length > 3 && !readIcon(avatar) && (
                <span className="avatar-overflow">+{members.length - 3}</span>
              )}
            </div>
            <div>
              <h2>{title}</h2>
              <p>
                {members.length > 1
                  ? t('{count} bots · Group conversation', { count: members.length })
                  : members[0]?.spec.Metadata?.['kites.role'] || memberName(members[0])}
              </p>
              <WorkspaceBadge session={session} environments={environments} onClick={onDetails} />
            </div>
          </div>
          <div className="header-actions">
            <button
              className="work-toggle"
              aria-label={t('Open work details')}
              onClick={() => setPanel(selectedWork?.id || 'latest')}
            >
              <PanelRight size={16} />
              <span>{t('Work')}</span>
            </button>
            <button
              className="icon-button export-conversation"
              aria-label={t('Export conversation')}
              title={t('Export conversation')}
              onClick={() => {
                void download(`${title}.md`, transcript(events)).catch((e) =>
                  setLocalError(e.message),
                );
              }}
            >
              <Download size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t('Conversation menu')}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={21} />
            </button>
          </div>
          {menu && (
            <div className="conversation-menu">
              <button
                onClick={() => {
                  setMenu(false);
                  onDetails();
                }}
              >
                {t('Conversation details')}
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setPanel(selectedWork?.id || 'latest');
                }}
              >
                {t('Open work details')}
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  void download(`${title}.md`, transcript(events)).catch((e) =>
                    setLocalError(e.message),
                  );
                }}
              >
                {t('Export conversation')}
              </button>
            </div>
          )}
        </header>
        <div
          className="message-scroll"
          ref={scroll}
          onScroll={(e) => {
            const el = e.currentTarget;
            setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
          }}
        >
          <div className="message-column">
            {loading ? (
              <div className="loading-line">
                <LoaderCircle className="spin" size={18} />
                {t('Loading conversation')}
              </div>
            ) : entries.length === 0 ? (
              <div className="conversation-welcome">
                <Avatar spec={members[0]?.spec} name={memberName(members[0])} size="hero" />
                <h1>{t('A little help goes a long way.')}</h1>
                <p>
                  {t('Start a conversation with {names}.', {
                    names: members.map(memberName).join(locale() === 'zh-CN' ? '、' : ' and '),
                  })}
                </p>
                <div className="suggestions">
                  {[
                    'Help me think something through',
                    'Plan the week ahead',
                    'Research a topic for me',
                  ].map((prompt) => (
                    <button
                      key={t(prompt)}
                      onClick={() => {
                        setDraft(t(prompt));
                        textarea.current?.focus();
                      }}
                    >
                      {t(prompt)}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {blocks.map((entry, index) => {
                  const previous = blocks[index - 1];
                  const stamp =
                    entry.kind === 'work' ? entry.entries[0]?.createdAt : entry.createdAt;
                  const previousStamp =
                    previous?.kind === 'work'
                      ? previous.entries[0]?.createdAt
                      : previous?.createdAt;
                  const date = dayLabel(stamp);
                  const sameSpeaker =
                    entry.kind === 'assistant' &&
                    previous?.kind === 'assistant' &&
                    previous.agentId === entry.agentId &&
                    !!stamp &&
                    !!previousStamp &&
                    Math.abs(Date.parse(stamp) - Date.parse(previousStamp)) < 5 * 60000 &&
                    entry.id !== firstUnread;
                  const renderBlock = () => {
                    if (entry.kind === 'work')
                      return (
                        <WorkCard
                          key={entry.id}
                          group={entry}
                          events={events}
                          members={members}
                          open={() => setPanel(entry.id)}
                        />
                      );
                    const member = members.find((m) => m.id === entry.agentId);
                    if (entry.kind === 'ask')
                      return <Question key={entry.id} entry={entry} reply={submit} />;
                    if (entry.kind === 'image')
                      return <ContentImages key={entry.id} content={[entry.payload]} />;
                    if (entry.kind === 'error')
                      return (
                        <p key={entry.id} className="inline-error" role="alert">
                          {entry.text}
                        </p>
                      );
                    return (
                      <article
                        className={`message ${entry.kind} ${sameSpeaker ? 'same-speaker' : ''}`}
                        key={entry.id}
                      >
                        {entry.kind === 'assistant' && !sameSpeaker && (
                          <div className="message-author">
                            <Avatar
                              spec={member?.spec}
                              name={memberName(member)}
                              size="tiny"
                              state={statuses.get(member?.id || '')}
                            />
                            <span>{memberName(member)}</span>
                          </div>
                        )}
                        <div className="message-body">
                          <ContentImages
                            content={entry.payload.messages?.flatMap((message) =>
                              Array.isArray(message.content) ? message.content : [],
                            )}
                          />
                          {entry.kind === 'user' ? (
                            <UserContent text={entry.text} />
                          ) : (
                            <Markdown
                              onFile={(path) => {
                                const group = workGroups.find((g) =>
                                  workFiles(g).some((f) => f.path === path),
                                );
                                if (group) {
                                  setPanelFile(path);
                                  setPanel(group.id);
                                } else
                                  setNotice('This local file was not included in a tool result.');
                              }}
                            >
                              {entry.text}
                            </Markdown>
                          )}
                          {entry.pending && <span className="typing-caret" />}
                        </div>
                        {entry.kind === 'assistant' &&
                          !entry.pending &&
                          finalMessages.has(entry.id) && (
                            <div className="message-actions">
                              <time dateTime={entry.createdAt}>{messageTime(entry.createdAt)}</time>
                              <button
                                aria-label={t('Reply to response')}
                                onClick={() => {
                                  setQuote(entry.text);
                                  textarea.current?.focus();
                                }}
                              >
                                <Reply size={14} />
                                <span>{t('Reply')}</span>
                              </button>
                              <button
                                aria-label={t('Copy response')}
                                onClick={() => {
                                  void navigator.clipboard.writeText(entry.text).then(
                                    () => setNotice('Copied'),
                                    () =>
                                      setLocalError(
                                        'Clipboard access is unavailable. Use Export instead.',
                                      ),
                                  );
                                }}
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                aria-label={t('Save response to library')}
                                onClick={() => void saveAnswer(entry)}
                              >
                                <FileText size={14} />
                                <span>{t('Save')}</span>
                              </button>
                            </div>
                          )}
                      </article>
                    );
                  };
                  return (
                    <div
                      className="conversation-block"
                      key={entry.id}
                      data-read-seq={
                        entry.kind !== 'work' &&
                        !entry.pending &&
                        ['assistant', 'ask', 'image', 'error'].includes(entry.kind)
                          ? entry.seq
                          : entry.kind === 'ask'
                            ? entry.seq
                            : undefined
                      }
                    >
                      {date && date !== dayLabel(previousStamp) && (
                        <div className="day-divider">{date}</div>
                      )}
                      {entry.id === firstUnread && (
                        <div className="new-divider">
                          <span>{t('NEW')}</span>
                        </div>
                      )}
                      {renderBlock()}
                    </div>
                  );
                })}
              </>
            )}
            {!busy && stopped && (
              <p className="run-stopped">{t('Run stopped. Send a message to continue.')}</p>
            )}
            {busy && (
              <div className="working">
                <span />
                <span />
                <span />
                {entries.some((entry) => entry.kind === 'ask' && entry.pending)
                  ? t('Waiting for your response')
                  : t('Working on it')}
              </div>
            )}
          </div>
        </div>
        {!nearBottom && (
          <button
            className="jump-bottom"
            style={{ bottom: composerHeight + 12 }}
            aria-label={
              reading.unread
                ? t(reading.unread === 1 ? '{count} new message' : '{count} new messages', {
                    count: reading.unread,
                  })
                : t('Scroll to latest')
            }
            onClick={() => {
              setNearBottom(true);
              scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
            }}
          >
            <ArrowDown size={18} />
            {reading.unread > 0 && (
              <span>
                {t(reading.unread === 1 ? '{count} new message' : '{count} new messages', {
                  count: reading.unread,
                })}
              </span>
            )}
          </button>
        )}
        <div className="composer-wrap" ref={composerWrap}>
          {notice && (
            <div className="toast" role="status">
              <Check size={15} />
              {t(notice)}
            </div>
          )}
          {reading.failure && (
            <p className="inline-error" role="status">
              {t(reading.failure)}
            </p>
          )}
          {(error || localError) && (
            <div className="composer-error" role="alert">
              <span>{t(localError || error)}</span>
              {error && <button onClick={retry}>{t('Reconnect')}</button>}
            </div>
          )}
          {quote && (
            <div className="reply-preview">
              <Reply size={14} />
              <span>{quote}</span>
              <button
                className="icon-button"
                aria-label={t('Remove quoted reply')}
                onClick={() => setQuote('')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {pendingQuestion && (
            <button
              className="pending-question-link"
              onClick={() => {
                const card = document.getElementById(`question-${pendingQuestion.id}`);
                card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card
                  ?.querySelector<HTMLInputElement>('input, textarea')
                  ?.focus({ preventScroll: true });
              }}
            >
              <Reply size={15} />
              <span>
                {t('A question for you')}
                <small>
                  {pendingQuestion.payload.questions?.[0]?.prompt || pendingQuestion.text}
                </small>
              </span>
              <ArrowUp size={16} />
            </button>
          )}
          <div
            className={`composer ${expandedComposer ? 'is-expanded' : ''} ${members.length > 1 || mentioned.length ? 'has-recipients' : ''} ${dragging ? 'is-dragging' : ''}`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setComposerActions(false);
                setExpandedComposer(false);
              }
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setComposerActions(false);
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploading) void attach(e.dataTransfer.files);
            }}
          >
            {composerActions && (
              <div className="composer-actions" role="menu" aria-label={t('Add context')}>
                <button
                  role="menuitem"
                  onClick={() => {
                    setComposerActions(false);
                    fileInput.current?.click();
                  }}
                >
                  <Paperclip size={17} />
                  <span>
                    {t('Attach files or images')}
                    <small>{t('Choose, drop, or paste · up to 8 files')}</small>
                  </span>
                </button>
                <button role="menuitem" onClick={insertMention}>
                  @
                  <span>
                    {t('Mention a bot')}
                    <small>{t('Choose who should reply')}</small>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setComposerActions(false);
                    onDetails();
                  }}
                >
                  <Folder size={17} />
                  <span>
                    {t('Change workspace')}
                    <small>{t('Files and context for this conversation')}</small>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setComposerActions(false);
                    setExpandedComposer(!expandedComposer);
                    textarea.current?.focus();
                  }}
                >
                  <Maximize2 size={17} />
                  <span>{t(expandedComposer ? 'Collapse editor' : 'Expand editor')}</span>
                </button>
              </div>
            )}
            {dragging && <div className="drop-hint">{t('Drop files or images here')}</div>}
            {!!suggestions.length && (
              <div
                className="mention-menu"
                role="listbox"
                id="bot-mention-list"
                aria-label={t('Mention a bot')}
              >
                {suggestions.map((member, index) => (
                  <button
                    key={member.id}
                    id={`mention-${index}`}
                    type="button"
                    role="option"
                    aria-label={memberName(member)}
                    aria-selected={index === mentionIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseMention(member.id)}
                  >
                    <Avatar spec={member.spec} name={memberName(member)} size="tiny" />
                    <span>{memberName(member)}</span>
                    <small>{t('In this chat')}</small>
                  </button>
                ))}
              </div>
            )}

            {images.length > 0 && (
              <div className="attachments">
                {images.map((img, index) => (
                  <div key={index} className="attachment-tile">
                    <button
                      className="attachment-preview"
                      aria-label={t('Preview {name}', { name: img.name })}
                      onClick={() => setPreview(img)}
                    >
                      {imageTypes.includes(img.mimeType) ? (
                        <img src={`data:${img.mimeType};base64,${img.data}`} alt={img.name} />
                      ) : (
                        <span className="file-attachment">
                          <FileText size={22} />
                          <small>{img.name.split('.').at(-1)?.toUpperCase() || t('File')}</small>
                        </span>
                      )}
                    </button>
                    <span className="attachment-name" title={img.name}>
                      {img.name}
                    </span>
                    <button
                      className="attachment-remove"
                      aria-label={t('Remove {name}', { name: img.name || t('Attached image') })}
                      onClick={() => setImages(images.filter((_, i) => i !== index))}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textarea}
              aria-label={t('Message')}
              rows={1}
              disabled={uploading}
              role="combobox"
              aria-expanded={!!suggestions.length}
              aria-autocomplete="list"
              aria-controls={suggestions.length ? 'bot-mention-list' : undefined}
              aria-activedescendant={suggestions.length ? `mention-${mentionIndex}` : undefined}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  void attach(files);
                }
              }}
              onClick={(e) => setCaret(e.currentTarget.selectionStart)}
              placeholder={t('Message {name}…', {
                name: members.length > 1 ? t('the group') : memberName(members[0]),
              })}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setCaret(e.target.selectionStart);
                setMentionIndex(0);
                setHideMentions(false);
                sessionStorage.setItem(`kites.draft.${session.id}`, e.target.value);
              }}
              onKeyDown={(e) => {
                if (suggestions.length && !e.nativeEvent.isComposing) {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setHideMentions(true);
                    return;
                  }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex(
                      (mentionIndex + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
                        suggestions.length,
                    );
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    chooseMention(suggestions[mentionIndex]?.id || suggestions[0].id);
                    return;
                  }
                }
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  window.innerWidth > 700
                ) {
                  e.preventDefault();
                  if (!busy) void sendMessage();
                }
              }}
            />
            <div className="composer-toolbar">
              <input
                type="file"
                ref={fileInput}
                disabled={uploading}
                multiple
                hidden
                onChange={(e) => void attach(e.target.files)}
              />
              <button
                className="icon-button"
                aria-label={t('Add context')}
                aria-expanded={composerActions}
                aria-haspopup="menu"
                onClick={() => setComposerActions(!composerActions)}
              >
                <Plus size={20} />
              </button>
              <button
                className="icon-button"
                aria-label={t('Mention a bot')}
                onClick={insertMention}
              >
                @
              </button>
              {mentioned.length ? (
                <span className="composer-model">
                  {members
                    .filter((m) => mentioned.includes(m.id))
                    .map((m) => '@' + memberName(m))
                    .join(', ')}
                </span>
              ) : members.length > 1 ? (
                <select
                  aria-label={t('Send to')}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">{memberName(members[0])}</option>
                  <option value="all">{t('Everyone')}</option>
                  {members.slice(1).map((a) => (
                    <option value={a.id} key={a.id}>
                      {memberName(a)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="composer-model">
                  {members[0]?.spec.Model || members[0]?.spec.Kind}
                </span>
              )}
              <span className="grow" />
              <button
                className="composer-expand icon-button"
                aria-label={t(expandedComposer ? 'Collapse editor' : 'Expand editor')}
                onClick={() => setExpandedComposer(!expandedComposer)}
              >
                {expandedComposer ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {uploading || readingFiles ? (
                <LoaderCircle size={20} className="spin" aria-label={t('Uploading files')} />
              ) : busy ? (
                <button
                  className="send-button"
                  aria-label={t('Stop bot')}
                  onClick={() => void interrupt()}
                >
                  <Square size={15} fill="currentColor" />
                </button>
              ) : (
                <button
                  className="send-button"
                  aria-label={t('Send message')}
                  disabled={!draft.trim() && !images.length}
                  onClick={() => void sendMessage()}
                >
                  <ArrowUp size={20} />
                </button>
              )}
            </div>
          </div>
          <p className="composer-caption">
            {t('Enter to send · Shift+Enter for a new line · Paste images')}
          </p>
        </div>
      </div>
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          {imageTypes.includes(preview.mimeType) ? (
            <img
              className="attachment-full-preview"
              src={`data:${preview.mimeType};base64,${preview.data}`}
              alt={preview.name}
            />
          ) : (
            <p>
              {preview.name} · {preview.mimeType} · {Math.ceil((preview.data.length * 0.75) / 1024)}{' '}
              KB
            </p>
          )}
        </Modal>
      )}
      {panel && (
        <WorkPanel
          initialFile={panelFile}
          group={selectedWork}
          events={events}
          members={members}
          close={() => {
            setPanel(null);
            setPanelFile(null);
          }}
        />
      )}
    </div>
  );
}
