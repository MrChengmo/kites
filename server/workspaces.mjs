import { workspaceAccess, workspaceMode, sessionPlace } from '../shared/workspaceAccess.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
// agentEnv maps an agent Kind to env vars for each new chat member. AGENTWAY_MODEL
// is the Model when the member has none. Member values win.
export function workspaceRequests(runtime, agentEnv = {}) {
  function addEnv(agent) {
    const { AGENTWAY_MODEL: model, ...vars } = agentEnv[agent.Kind] || {};
    if (Object.keys(vars).length) agent.Env = { ...vars, ...agent.Env };
    if (!agent.Model && model) agent.Model = model;
  }
  async function get(path) {
    const response = await runtime(path, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw fail(response.status, await response.text());
    return response.json();
  }
  async function profile(spec) {
    const id = spec.Metadata?.['kites.profile'] || spec.ID;
    return id ? (await get(`/api/v1/agents/${encodeURIComponent(id)}`)).Spec : spec;
  }
  function mode(spec, place) {
    try {
      return workspaceMode(spec, place);
    } catch (error) {
      throw fail(403, error.message);
    }
  }
  return async function prepare(path, method, data) {
    if (method === 'POST' && path === '/api/v1/agents') {
      try {
        workspaceAccess(data);
      } catch (error) {
        throw fail(400, error.message);
      }
    }
    if (method === 'PUT' && /^\/api\/v1\/agents\/[^/]+$/.test(path)) {
      try {
        workspaceAccess(data.Spec);
      } catch (error) {
        throw fail(400, error.message);
      }
    }
    if (method === 'POST' && path === '/api/v1/sessions') {
      const place = sessionPlace(data);
      data.workspace_id = place.workspace || undefined;
      delete data.WorkspaceID;
      for (const member of data.members || []) {
        if (!member.agent) continue;
        const spec = await profile(member.agent);
        const sandbox = mode(spec, place);
        if (sandbox) member.agent.Sandbox = sandbox;
        addEnv(member.agent);
      }
    }
    if (method === 'POST' && /^\/api\/v1\/agents\/[^/]+\/prompt$/.test(path)) {
      const record = await get(path.slice(0, -'/prompt'.length));
      if (workspaceAccess(record.Spec).restricted)
        throw fail(403, 'Start a chat to apply this bot’s workspace access settings.');
    }
    const match = path.match(/^\/api\/v1\/sessions\/([^/]+)\/(workspace|prompt)$/);
    if (!match || !['POST', 'PUT'].includes(method)) return data;
    const session = await get(`/api/v1/sessions/${match[1]}`);
    if (!session.spec || !Array.isArray(session.agents))
      throw fail(502, 'Runtime returned an invalid session view.');
    const changing = match[2] === 'workspace';
    const place = changing
      ? { environment: data.environment_id, workspace: data.workspace_id || '' }
      : sessionPlace(session.spec);
    if (changing && !place.environment) throw fail(400, 'Choose an environment.');
    const sandboxes = {};
    for (const member of session.agents) {
      const sandbox = mode(await profile(member.spec), place);
      sandboxes[member.id] = sandbox;
      if (!changing && sandbox && member.spec.Sandbox !== sandbox)
        throw fail(
          409,
          'Bot access changed. Apply its workspace settings before sending another message.',
        );
    }
    return changing ? { ...data, sandboxes } : data;
  };
}
