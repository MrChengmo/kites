import { t } from './i18n';
import type { Entry } from './events';
import type { PlanTask, RuntimeEvent } from './types';
export interface WorkGroup {
  id: string;
  kind: 'work';
  entries: Entry[];
}
export function groupWork(entries: Entry[]): (Entry | WorkGroup)[] {
  const result: (Entry | WorkGroup)[] = [];
  let group: WorkGroup | undefined;
  for (const entry of entries) {
    if (entry.kind === 'user') group = undefined;
    if (['tool', 'thinking', 'plan'].includes(entry.kind)) {
      if (!group) {
        group = { id: `work-${entry.id}`, kind: 'work', entries: [] };
        result.push(group);
      }
      group.entries.push(entry);
    } else result.push(entry);
  }
  return result;
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function nativeItem(entry: Entry) {
  return object(object(entry.payload._meta).codex_item || entry.payload.input);
}
export function toolLabel(entry: Entry) {
  const item = nativeItem(entry);
  const actions = Array.isArray(item.commandActions) ? item.commandActions.map(object) : [];
  if (actions.length && actions.every((a) => a.type === 'read'))
    return t('Read {files}', { files: actions.map((a) => a.name || a.path).join(', ') });
  const changes = Array.isArray(item.changes) ? item.changes.map(object) : [];
  if (changes.length)
    return t('Edit {files}', {
      files: changes.map((c) => String(c.path).split('/').pop()).join(', '),
    });
  if (item.type === 'collabAgentToolCall')
    return (
      (
        {
          spawnAgent: 'Delegate a task',
          wait: 'Wait for collaborators',
          sendInput: 'Message a collaborator',
          closeAgent: 'Close a collaborator',
        } as Record<string, string>
      )[String(item.tool)] || 'Bot collaboration'
    );
  return (
    (
      {
        commandExecution: 'Run a command',
        fileChange: 'Review file changes',
        webSearch: 'Search the web',
        imageView: 'View an image',
        imageGeneration: 'Create an image',
      } as Record<string, string>
    )[entry.text] || entry.text
  );
}
export function turnStatus(entry: Entry, events: RuntimeEvent[]) {
  return events
    .filter(
      (e) =>
        e.agent_id === entry.agentId && e.turn_id === entry.turnId && e.payload.type === 'status',
    )
    .at(-1)?.payload.status;
}
export function toolStatus(entry: Entry, events: RuntimeEvent[]) {
  if (['completed', 'error'].includes(entry.payload.status || '')) return entry.payload.status!;
  const status = turnStatus(entry, events);
  if (status === 'cancelled') return 'Stopped';
  if (['idle', 'ended', 'failed'].includes(status || '')) return 'No final result';
  return 'running';
}
export function plans(group: WorkGroup): { agentId?: string; tasks: PlanTask[] }[] {
  const latest = new Map<string, { agentId?: string; tasks: PlanTask[] }>();
  for (const e of group.entries)
    if (e.kind === 'plan')
      latest.set(e.agentId || '', { agentId: e.agentId, tasks: e.payload.tasks || [] });
  return [...latest.values()];
}
export interface Worker {
  id: string;
  parent?: string;
  name: string;
  prompt: string;
  status: string;
  result: string;
  calls: Entry[];
}
export function workers(group: WorkGroup): Worker[] {
  const result = new Map<string, Worker>();
  for (const e of group.entries) {
    const item = nativeItem(e);
    if (item.type !== 'collabAgentToolCall') continue;
    const states = object(item.agentsStates);
    const ids = new Set([
      ...(Array.isArray(item.receiverThreadIds)
        ? item.receiverThreadIds.filter((id): id is string => typeof id === 'string')
        : []),
      ...Object.keys(states),
    ]);
    for (const id of ids) {
      const state = object(states[id]);
      const previous = result.get(id);
      result.set(id, {
        id,
        parent: e.agentId,
        name: String(
          state.agentNickname ||
            state.nickname ||
            previous?.name ||
            t('Bot {id}', { id: id.slice(0, 6) }),
        ),
        prompt:
          typeof item.prompt === 'string' && item.prompt ? item.prompt : previous?.prompt || '',
        status:
          typeof state.status === 'string'
            ? state.status
            : previous?.status || 'Status unavailable',
        result: typeof state.message === 'string' ? state.message : previous?.result || '',
        calls: [...(previous?.calls || []), e],
      });
    }
  }
  return [...result.values()];
}
export interface WorkFile {
  id: string;
  name: string;
  path: string;
  content: string;
  format: 'File content' | 'Change preview';
}
export function workFiles(group: WorkGroup): WorkFile[] {
  const files = new Map<string, WorkFile>();
  for (const e of group.entries) {
    if (e.kind !== 'tool' || e.payload.status !== 'completed') continue;
    const item = nativeItem(e);
    const changes = Array.isArray(item.changes) ? item.changes.map(object) : [];
    for (const c of changes) {
      if (typeof c.path !== 'string' || typeof c.diff !== 'string') continue;
      files.set(c.path, {
        id: c.path,
        name: c.path.split('/').pop() || c.path,
        path: c.path,
        content: c.diff,
        format: object(c.kind).type === 'add' ? 'File content' : 'Change preview',
      });
    }
    const blocks = Array.isArray(e.payload.content) ? e.payload.content.map(object) : [];
    for (const b of blocks) {
      if (b.type !== 'diff' || typeof b.path !== 'string' || files.has(b.path)) continue;
      files.set(b.path, {
        id: b.path,
        name: b.path.split('/').pop() || b.path,
        path: b.path,
        content: String(b.new || b.hunks || ''),
        format: typeof b.new === 'string' ? 'File content' : 'Change preview',
      });
    }
  }
  return [...files.values()];
}
