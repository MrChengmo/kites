import { IconPicker, readIcon, AgentIcon } from './AgentIcon';
import { t } from './i18n';
import { useState } from 'react';
import { ArrowUpRight, CalendarClock, ChevronRight, Clock3, Pause, Play, Plus } from 'lucide-react';
import { agentName, api, encode, saveProduct } from './api';
import type { AgentRecord, Routine, Run } from './types';
import { Avatar, DateLabel, Empty, Field, Form, PageHeading, Status } from './ui';
export function RoutineForm({
  routine,
  agents,
  onSaved,
}: {
  routine?: Routine;
  agents: AgentRecord[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(routine?.name || '');
  const [icon, setIcon] = useState(() => readIcon(routine?.avatar));
  const [prompt, setPrompt] = useState(routine?.prompt || '');
  const [agentId, setAgentId] = useState(routine?.agentId || agents[0]?.ID || '');
  const [schedule, setSchedule] = useState(routine?.schedule || 'weekdays');
  const [time, setTime] = useState(routine?.time || '09:00');
  const [minutes, setMinutes] = useState(routine?.minutes || 60);
  const [timezone, setTimezone] = useState(
    routine?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [enabled, setEnabled] = useState(routine?.enabled ?? true);
  return (
    <>
      <div className="feature-intro">
        <div className="feature-icon sage">
          <CalendarClock size={25} />
        </div>
        <h2>{t('One less thing to remember.')}</h2>
        <p>{t('Give your bot a task and a time. Come back to the result.')}</p>
      </div>
      <Form
        label={routine ? t('Save routine') : t('Create routine')}
        submit={async () => {
          await saveProduct(
            'routines',
            {
              name,
              prompt,
              agentId,
              schedule,
              time,
              minutes,
              timezone,
              enabled,
              avatar: icon ? JSON.stringify(icon) : '',
            },
            routine?.id,
          );
          await onSaved();
        }}
      >
        <details className="form-details">
          <summary>{t('Task avatar')}</summary>
          <div className="profile-preview">
            <Avatar icon={icon} name={name || t('Task')} size="large" />
          </div>
          <IconPicker value={icon} onChange={setIcon} />
        </details>
        <Field label={t('Name')}>
          <input
            required
            maxLength={120}
            value={name}
            placeholder={t('Morning briefing')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('Bot')}>
          <select required value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.ID} value={a.ID}>
                {agentName(a)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('What should happen?')}>
          <textarea
            required
            rows={5}
            maxLength={32000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t(
              'Prepare a short briefing with the three things I should know today. Include sources.',
            )}
          />
        </Field>
        <div className="form-grid">
          <Field label={t('Repeat')}>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Routine['schedule'])}
            >
              <option value="weekdays">{t('Every weekday')}</option>
              <option value="daily">{t('Every day')}</option>
              <option value="interval">{t('At an interval')}</option>
            </select>
          </Field>
          {schedule === 'interval' ? (
            <Field label={t('Every (minutes)')}>
              <input
                type="number"
                min={5}
                max={10080}
                required
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </Field>
          ) : (
            <Field label={t('Time')}>
              <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={t('Time zone')}>
          <input
            required
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder={t('Asia/Shanghai')}
            list="timezones"
          />
          <datalist id="timezones">
            {[
              'Asia/Shanghai',
              'Asia/Tokyo',
              'Europe/London',
              'Europe/Berlin',
              'America/New_York',
              'America/Los_Angeles',
              'UTC',
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </datalist>
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t('Enable this routine')}</span>
        </label>
        <p className="notice">
          {t(
            'Runs while the Kites service and Agentway host are online. After downtime, one missed occurrence runs; earlier missed occurrences are skipped.',
          )}
        </p>
      </Form>
    </>
  );
}
export function Routines({
  routines,
  runs,
  agents,
  onNew,
  onEdit,
  onOpen,
  onRefresh,
  onError,
}: {
  routines: Routine[];
  runs: Run[];
  agents: AgentRecord[];
  onNew: () => void;
  onEdit: (r: Routine) => void;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState('routines');
  const [busy, setBusy] = useState('');
  async function act(routine: Routine, action: 'run' | 'toggle') {
    setBusy(routine.id);
    try {
      if (action === 'run')
        await api(`/api/kites/routines/${encode(routine.id)}/run`, { method: 'POST', body: '{}' });
      else await saveProduct('routines', { ...routine, enabled: !routine.enabled }, routine.id);
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow={t('A rhythm that works for you')}
        title={t('Routines')}
        description={t('Small tasks, taken care of.')}
        action={
          <button className="primary" disabled={!agents.length} onClick={onNew}>
            <Plus size={17} />
            {t('New routine')}
          </button>
        }
      />
      <div className="tabs">
        <button className={tab === 'routines' ? 'selected' : ''} onClick={() => setTab('routines')}>
          {t('Your routines')}
          <span>{routines.length}</span>
        </button>
        <button className={tab === 'runs' ? 'selected' : ''} onClick={() => setTab('runs')}>
          {t('Run history')}
          <span>{runs.length}</span>
        </button>
      </div>
      {tab === 'routines' ? (
        routines.length ? (
          <div className="routine-list">
            {routines.map((r) => {
              const agent = agents.find((a) => a.ID === r.agentId);
              return (
                <article className="routine-card" key={r.id}>
                  <div className="routine-card-top">
                    <div className={`routine-symbol ${r.enabled ? 'sage' : ''}`}>
                      {readIcon(r.avatar) ? (
                        <AgentIcon icon={readIcon(r.avatar)!} />
                      ) : (
                        <CalendarClock size={21} />
                      )}
                    </div>
                    <Status value={r.enabled ? 'active' : 'paused'} />
                  </div>
                  <button className="routine-open" onClick={() => onEdit(r)}>
                    <h2>{r.name}</h2>
                    <p>{r.prompt}</p>
                  </button>
                  <div className="routine-schedule">
                    <Clock3 size={14} />
                    {r.schedule === 'interval'
                      ? t('Every {minutes} minutes', { minutes: r.minutes })
                      : t(r.schedule === 'weekdays' ? 'Weekdays at {time}' : 'Daily at {time}', {
                          time: r.time,
                        })}
                    <small>{r.timezone}</small>
                  </div>
                  <div className="routine-card-footer">
                    <span className="agent-label">
                      <Avatar spec={agent?.Spec} name={agentName(agent)} size="tiny" />
                      {agentName(agent)}
                    </span>
                    <button
                      className="icon-button"
                      disabled={busy === r.id}
                      aria-label={t(r.enabled ? 'Pause {name}' : 'Resume {name}', { name: r.name })}
                      onClick={() => void act(r, 'toggle')}
                    >
                      {r.enabled ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      className="subtle-button"
                      disabled={busy === r.id}
                      onClick={() => void act(r, 'run')}
                    >
                      {t('Run now')}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {r.enabled && (
                    <div className="next-run">
                      {t('Next')}
                      <DateLabel time={r.nextAt} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={<CalendarClock />}
            title={t('Make room in your day.')}
            action={
              <button className="primary" disabled={!agents.length} onClick={onNew}>
                {t('Create your first routine')}
              </button>
            }
          >
            {t('Let a bot take care of the things you do again and again.')}
            {!agents.length ? t(' Create a bot first.') : ''}
          </Empty>
        )
      ) : runs.length ? (
        <div className="list">
          {runs.map((run) => (
            <button
              className="list-row run-row"
              key={run.id}
              disabled={!run.sessionId}
              onClick={() => run.sessionId && onOpen(run.sessionId)}
            >
              <span className="file-symbol">
                <Clock3 size={19} />
              </span>
              <span className="grow">
                <strong>{run.name}</strong>
                <small>
                  <DateLabel time={run.startedAt} />
                </small>
                {run.error && <small className="error-text">{run.error}</small>}
              </span>
              <Status value={run.status} />
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Clock3 />} title={t('Your results will land here.')}>
          {t('Run a routine to see its chat and status.')}
        </Empty>
      )}
    </div>
  );
}
