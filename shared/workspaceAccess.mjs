export const workspaceAccessKey = 'kites.workspaceAccess';
export function workspaceAccess(spec) {
  const raw = spec?.Metadata?.[workspaceAccessKey];
  if (!raw) return { restricted: false, workspaces: [] };
  const value = JSON.parse(raw);
  if (
    typeof value.restricted !== 'boolean' ||
    !Array.isArray(value.workspaces) ||
    value.workspaces.some(
      (w) =>
        typeof w.environment !== 'string' ||
        !w.environment ||
        typeof w.workspace !== 'string' ||
        !['read', 'write'].includes(w.mode),
    )
  )
    throw new Error('Invalid workspace access settings.');
  return value;
}
export function workspaceMode(spec, place) {
  const access = workspaceAccess(spec);
  if (!access.restricted) return '';
  const grant = access.workspaces.find(
    (w) => w.environment === place.environment && w.workspace === place.workspace,
  );
  if (!grant) throw new Error('This workspace is not permitted for this bot.');
  if (spec.Kind !== 'codex')
    throw new Error('Workspace read/write enforcement currently requires a Codex bot.');
  if (spec.MCP?.length)
    throw new Error(
      'Restricted workspace access cannot constrain plugins. Remove this bot’s plugins first.',
    );
  return grant.mode === 'read' ? 'read-only' : 'workspace-write';
}
export function workspaceAllowed(spec, place) {
  try {
    workspaceMode(spec, place);
    return true;
  } catch {
    return false;
  }
}
export function sessionPlace(spec) {
  return {
    environment: spec.EnvironmentID || '',
    workspace: spec.workspace_id || spec.WorkspaceID || '',
  };
}
