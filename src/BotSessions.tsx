import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Plus, Users } from 'lucide-react';
import { agentName, memberName } from './api';
import { Avatar } from './ui';
import { t } from './i18n';
import type { AgentRecord, Session } from './types';

export function groupBotSessions(sessions: Session[], bots: AgentRecord[]) {
  const groups = new Map<
    string,
    { id: string; name: string; bot?: AgentRecord; sessions: Session[] }
  >();
  for (const session of sessions) {
    const member = session.agents[0];
    const profile = member?.spec.Metadata?.['kites.profile'];
    const bot = bots.find((b) => b.ID === profile || b.ID === member?.id);
    const id = session.agents.length > 1 ? 'groups' : profile || member?.id || 'other';
    if (!groups.has(id))
      groups.set(id, {
        id,
        bot: id === 'groups' ? undefined : bot,
        name: id === 'groups' ? t('Group chats') : bot ? agentName(bot) : memberName(member),
        sessions: [],
      });
    groups.get(id)!.sessions.push(session);
  }
  return [...groups.values()];
}
export function BotSessions({
  sessions,
  bots,
  active,
  compact = false,
  onNew,
  children,
}: {
  sessions: Session[];
  bots: AgentRecord[];
  active?: string;
  compact?: boolean;
  onNew: (bot?: AgentRecord, group?: boolean) => void;
  children: (session: Session) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('kites.collapsedBots') || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    const group = groupBotSessions(sessions, bots).find((g) =>
      g.sessions.some((s) => s.id === active),
    );
    if (group) setCollapsed((ids) => ids.filter((id) => id !== group.id));
  }, [active]);
  function toggle(id: string) {
    setCollapsed((ids) => {
      const next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
      localStorage.setItem('kites.collapsedBots', JSON.stringify(next));
      return next;
    });
  }
  return (
    <div className={`bot-session-tree${compact ? ' compact' : ''}`}>
      {groupBotSessions(sessions, bots).map((group) => {
        const closed = collapsed.includes(group.id);
        const shown =
          compact && !expanded.includes(group.id)
            ? group.sessions.filter((s, i) => i < 5 || s.id === active)
            : group.sessions;
        return (
          <section className="bot-session-group" key={group.id}>
            <div className="bot-session-heading">
              <button
                aria-expanded={!closed}
                onClick={() => toggle(group.id)}
                aria-label={t('Chats with {name}', { name: group.name })}
              >
                <ChevronRight size={13} className={closed ? '' : 'expanded'} />
                {group.id === 'groups' ? (
                  <Users size={19} />
                ) : (
                  <Avatar
                    spec={group.bot?.Spec || group.sessions[0].agents[0]?.spec}
                    name={group.name}
                    size="tiny"
                  />
                )}
                <span>{group.name}</span>
                <small>{group.sessions.length}</small>
              </button>
              <button
                className="bot-new-chat"
                aria-label={t('New chat with {name}', { name: group.name })}
                onClick={() => onNew(group.bot, group.id === 'groups')}
              >
                <Plus size={15} />
              </button>
            </div>
            {!closed && (
              <div className="bot-session-children">
                {shown.map(children)}
                {shown.length < group.sessions.length && (
                  <button
                    className="bot-show-more"
                    onClick={() => setExpanded([...expanded, group.id])}
                  >
                    {t('Show more')}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
