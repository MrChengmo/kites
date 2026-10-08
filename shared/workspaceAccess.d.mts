import type { AgentSpec } from '../src/types';
export interface WorkspacePlace {
  environment: string;
  workspace: string;
}
export interface WorkspaceGrant extends WorkspacePlace {
  mode: 'read' | 'write';
}
export interface WorkspaceAccess {
  restricted: boolean;
  workspaces: WorkspaceGrant[];
}
export const workspaceAccessKey: string;
export function workspaceAccess(spec?: AgentSpec): WorkspaceAccess;
export function workspaceMode(spec: AgentSpec, place: WorkspacePlace): string;
export function workspaceAllowed(spec: AgentSpec, place: WorkspacePlace): boolean;
export function sessionPlace(spec: Record<string, unknown>): WorkspacePlace;
