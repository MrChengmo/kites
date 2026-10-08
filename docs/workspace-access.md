# Workspaces and bot access

Kites shows the runtime session's workspace on the Work list, Chats list, sidebar, and conversation header. Hover a badge to see the folder. Click the header badge to open chat details.

## Bot defaults and access

Open **Bots → bot profile → Workspace & access**.

- **Default workspace** is used for new chats and future routine runs.
- **Only selected workspaces** lists the workspaces where this bot may execute. Environment roots are separate choices.
- A workspace can be **Read only** or **Read & write**.
- Existing bot profiles preserve their provider permissions until restricted access is enabled.

Kites validates grants from the saved profile on the server. Group chats require permission from every participating bot. New prompts check the current saved grants. If access is downgraded, a chat must apply its workspace settings before another prompt can run. An already running turn is not interrupted by editing a bot profile.

Read/write enforcement requires Codex without MCP plugins. Other providers and plugins retain their own permissions and cannot be used with these restricted settings. Codex read-only prevents command/file writes. Workspace-write permits writes in the selected workspace and its declared additional directories, disables temporary-directory write exceptions, and prevents escalation or a turn-local CWD override. This does not limit all filesystem reads to the selected workspace: use an isolated Environment for that boundary. It follows [Codex sandbox behavior](https://developers.openai.com/codex/security).

## Change an existing chat

Open **chat → workspace badge → Workspace → Apply workspace**. A chat has one active workspace. Its workspace section also lets you create a workspace record inside the selected environment. Restricted bots need permission for a newly created workspace before it can be selected.

Changes require an idle chat. They preserve the session ID, event history, and native provider resume pointers. They rebuild bot processes in the selected environment/workspace. Files remain in their existing folders. Changing a chat does not change its bots' defaults or another chat's placement.

## Code

| Layer | Files |
|---|---|
| UI | `src/WorkspaceAccess.tsx`, `src/Environments.tsx`, `src/AgentForms.tsx` |
| Placement calls | `src/api.ts` |
| Saved grants and validation | `shared/workspaceAccess.mjs`, `server/workspaces.mjs` |
| Routine execution | `server/scheduler.mjs` through the same checked runtime client |
| Runtime HTTP | `api/session_workspace.go`: `PUT /api/v1/sessions/{id}/workspace` |
| Runtime session | `agentway/session_workspace.go`: `Session.SetWorkspace` |
| Catalog transport | `agentway/provider_session_client.go`, `agentway/catalog_session_handle.go` |
| Native permissions | `AgentSpec.Sandbox`, Codex thread/start, thread/resume, and turn/start |

Grant metadata is stored under `Spec.Metadata["kites.workspaceAccess"]`. Workspace identity uses the environment ID and workspace ID, so renaming a workspace does not change its grants. The default workspace stays under `kites.workspace`.

HTTP request:

```json
{
  "environment_id": "envid-…",
  "workspace_id": "ws_…"
}
```

The Kites service derives member sandbox settings from saved bot grants. The runtime resolves the workspace, refuses a busy session, and rebuilds its members. The existing session owner remains the authority for the operation. A target environment must execute on that session's host; a host move requires the runtime's migration flow.

## Verification

See `evidence/workspace-access/verification.json` and the accompanying screenshots and real-bot turn records. The isolated Codex test verifies an unlisted workspace is rejected, read-only denies a write, and changing the same session to a writable workspace preserves history and allows the write.
