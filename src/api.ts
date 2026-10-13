import { t } from './i18n';
import { workspaceMode } from '../shared/workspaceAccess.mjs';
import { sessionMember } from '../shared/member.mjs';
import { Capacitor } from '@capacitor/core';
import type {
  AgentRecord,
  AgentSpec,
  Environment,
  Input,
  ProductState,
  ReadingSummary,
  RuntimeEvent,
  Session,
} from './types';
export const isNative = Capacitor.isNativePlatform();
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    // Which request failed. Kept out of `message` so comparisons and
    // translations keep working on the text the runtime returned.
    public detail = '',
  ) {
    super(message);
  }
}
// What to show a user: the runtime message plus the request that produced it.
export function errorText(error: unknown) {
  const failure = error as Error & { detail?: string };
  return failure?.detail ? `${failure.message} (${failure.detail})` : failure?.message || '';
}
export const runtimeChoice = () =>
  localStorage.getItem('kites.runtime') === 'alpha' ? 'alpha' : 'local';
export function chooseRuntime(value: string) {
  localStorage.setItem('kites.runtime', value === 'alpha' ? 'alpha' : 'local');
  location.hash = '#settings';
  location.reload();
}
let endpoint = isNative ? localStorage.getItem('kites.endpoint') || '' : '';
let token = sessionStorage.getItem('kites.token') || '';
export function connection() {
  return { endpoint, token };
}
export function configureConnection(value: { endpoint: string; token: string }) {
  const url = value.endpoint.trim().replace(/\/$/, '');
  if (url) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(
        parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname)
      )
    )
      throw new Error('Use an HTTPS Kites server URL.');
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('Use the server origin, without a path or credentials.');
  }
  endpoint = isNative ? url : '';
  token = value.token;
  localStorage.setItem('kites.endpoint', endpoint);
  sessionStorage.setItem('kites.token', token);
}
export async function request(path: string, init: RequestInit = {}) {
  if (isNative && !endpoint) throw new Error('Connect to your Kites server to get started.');
  let response: Response;
  try {
    response = await fetch(endpoint + (runtimeChoice() === 'alpha' ? '/alpha' : '') + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    const failure = cause as Error;
    // A bare "Failed to fetch" or "signal timed out" says nothing about what
    // the user can do, so name the request that failed and keep the reason.
    const where = `${init.method || 'GET'} ${path}`;
    if (failure.name === 'TimeoutError')
      throw new APIError('The request timed out with no reply.', 0, where);
    if (failure.name === 'AbortError') throw failure;
    throw new APIError(`The request could not be sent: ${failure.message}`, 0, where);
  }
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      message = JSON.parse(raw).error || raw;
    } catch {
      /* The runtime can return plain text. */
    }
    throw new APIError(
      message || `Request failed (${response.status}).`,
      response.status,
      `${response.status} ${init.method || 'GET'} ${path}`,
    );
  }
  return response;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(
    init.method === 'POST' && /^\/api\/v1\/(agents|sessions|environments)$/.test(path)
      ? 180000
      : 20000,
  );
  const response = await request(path, {
    ...init,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  return response.status === 204 ? (undefined as T) : response.json();
}
export const encode = encodeURIComponent;
export async function listAgents() {
  const all: AgentRecord[] = [];
  let cursor = '';
  do {
    const page = await api<{ Items: AgentRecord[]; NextID?: string }>(
      `/api/v1/agents?limit=100&after_id=${encode(cursor)}`,
    );
    all.push(...(page.Items || []));
    if (page.NextID === cursor) break;
    cursor = page.NextID || '';
  } while (cursor);
  return all.filter((agent) => !agent.Spec.Metadata?.['kites.profile'] && !agent.CreatorSessionID);
}
export async function listSessions() {
  const all: Session[] = [];
  let cursor = '';
  do {
    const page = await api<{ sessions: Session[]; next_id?: string }>(
      `/api/v1/sessions?limit=100&after_id=${encode(cursor)}`,
    );
    all.push(...(page.sessions || []));
    if (page.next_id === cursor) break;
    cursor = page.next_id || '';
  } while (cursor);
  return all;
}
export async function listEnvironments() {
  const all: Environment[] = [];
  let cursor = '';
  do {
    const page = await api<{ environments: Environment[]; next_id?: string }>(
      `/api/v1/environments?limit=100&after_id=${encode(cursor)}`,
    );
    all.push(...(page.environments || []));
    if (page.next_id === cursor) break;
    cursor = page.next_id || '';
  } while (cursor);
  return all;
}
export const getProduct = () => api<ProductState>('/api/kites/state');
export const saveProduct = <T>(collection: string, value: unknown, id?: string) =>
  api<T>(`/api/kites/${collection}${id ? `/${encode(id)}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(value),
  });
export const createAgent = (spec: AgentSpec) =>
  api<AgentRecord>('/api/v1/agents', { method: 'POST', body: JSON.stringify(spec) });
export async function updateAgent(record: AgentRecord, spec: AgentSpec) {
  return api<AgentRecord>(`/api/v1/agents/${encode(record.ID)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...record, Spec: spec }),
  });
}
export const agentName = (a: AgentRecord | undefined) =>
  a?.Spec.Metadata?.['kites.name'] || a?.Key || t('Bot');
export const memberName = (a: Session['agents'][number] | undefined) =>
  a?.spec.Metadata?.['kites.name'] || a?.key || t('Bot');
export async function createSession(
  ids: string[],
  title: string,
  place?: { environment: string; workspace: string },
) {
  const profiles = await Promise.all(
    ids.map((id) => api<AgentRecord>(`/api/v1/agents/${encode(id)}`)),
  );
  const resolved = place?.environment
    ? place
    : {
        environment: profiles[0]?.Spec.EnvironmentID || '',
        workspace: profiles[0]?.Spec.Metadata?.['kites.workspace'] || '',
      };
  profiles.forEach((profile) => workspaceMode(profile.Spec, resolved));
  // On alpha a sandbox stops after one hour and its host goes offline. A chat
  // with no live Environment gets a new one, so the user never creates one.
  let created: { ID: string; Spec: { Host?: string } } | undefined;
  if (runtimeChoice() === 'alpha' && !resolved.environment) {
    const owner = profiles[0]?.Key?.split('/')[1] || 'kites';
    created = await api('/api/v1/environments', {
      method: 'POST',
      body: JSON.stringify({
        Key: `kites/${owner}-${crypto.randomUUID().slice(0, 8)}`,
        Kind: 'miaoda',
      }),
    });
    resolved.environment = created!.ID;
  }
  const session = await api<Session>('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      Key: `kites/chat/${crypto.randomUUID()}`,
      Host: created?.Spec.Host || profiles[0]?.Spec.Host || undefined,
      ...(resolved.environment
        ? { EnvironmentID: resolved.environment, workspace_id: resolved.workspace || undefined }
        : {}),
      members: profiles.map((profile) =>
        sessionMember(
          resolved.environment
            ? {
                ...profile,
                Spec: {
                  ...profile.Spec,
                  EnvironmentID: resolved.environment,
                  EnvironmentSpec: undefined,
                  Host: created?.Spec.Host || profile.Spec.Host,
                },
              }
            : profile,
        ),
      ),
    }),
  });
  try {
    await saveProduct('chats', { id: session.id, title, kind: ids.length > 1 ? 'group' : 'chat' });
  } catch (error) {
    throw new Error(
      `Conversation ${session.id} was created, but its title could not be saved: ${(error as Error).message}`,
    );
  }
  return session;
}
export const changeWorkspace = (id: string, place: { environment: string; workspace: string }) =>
  api<Session>(`/api/v1/sessions/${encode(id)}/workspace`, {
    method: 'PUT',
    body: JSON.stringify({ environment_id: place.environment, workspace_id: place.workspace }),
  });
export async function readStream(response: Response, onEvent: (event: RuntimeEvent) => void) {
  if (!response.body) throw new Error('The runtime returned no stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const accept = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);
    if (typeof event.payload === 'string') event.payload = JSON.parse(event.payload);
    if (event.payload) onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 8 * 1024 * 1024) throw new Error('An event exceeds the 8 MB limit.');
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        accept(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
      }
      if (done) {
        accept(buffer);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function history(id: string, signal: AbortSignal) {
  const events: RuntimeEvent[] = [];
  let cursor = 0;
  do {
    const page = await api<{ events: RuntimeEvent[]; next_seq?: number }>(
      `/api/v1/sessions/${encode(id)}/events?limit=1000&from_seq=${cursor}`,
      { signal },
    );
    events.push(...(page.events || []));
    if (page.next_seq === cursor) break;
    cursor = page.next_seq || 0;
  } while (cursor);
  return events;
}
export async function send(
  id: string,
  input: Input,
  options: { signal: AbortSignal; onEvent: (event: RuntimeEvent) => void },
) {
  await readStream(
    await request(`/api/v1/sessions/${encode(id)}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ input }),
      signal: options.signal,
    }),
    options.onEvent,
  );
}

export const getReading = (ids: string[]) =>
  api<Record<string, ReadingSummary>>(`/api/kites/reading?ids=${encode(ids.join(','))}`);
export const markReading = (id: string, readSeq: number) =>
  api<ReadingSummary>(`/api/kites/reading/${encode(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ readSeq }),
  });
