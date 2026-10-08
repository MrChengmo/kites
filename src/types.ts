export interface MCPServer {
  Name: string;
  URL?: string;
  Command?: string;
  Args?: string[];
  Env?: Record<string, string>;
}
export interface AgentSpec {
  ID?: string;
  Key?: string;
  Kind: string;
  Model?: string;
  Sandbox?: string;
  SystemPrompt?: string;
  Instructions?: string;
  EnvironmentID?: string;
  EnvironmentSpec?: { Kind: string; Roots: string[] };
  Host?: string;
  Metadata?: Record<string, string>;
  MCP?: MCPServer[];
  [key: string]: unknown;
}
export interface AgentRecord {
  ID: string;
  Key: string;
  Spec: AgentSpec;
  Revision: number;
  [key: string]: unknown;
}
export interface MemberAgent {
  id: string;
  key?: string;
  spec: AgentSpec;
  status: string;
}
export interface Session {
  id: string;
  key?: string;
  status: string;
  spec: Record<string, unknown>;
  agents: MemberAgent[];
  members: { ID: string; Kind: string; Key?: string }[];
}
export interface AskQuestion {
  id: string;
  prompt: string;
  required?: boolean;
  input?: { type?: string; multiple?: boolean; multiSelect?: boolean; allowCustom?: boolean };
  options?: { id: string; label: string; description?: string; kind?: string }[];
}
export interface PlanTask {
  id: string;
  title: string;
  status: string;
  items?: PlanTask[];
}
export interface Payload {
  type: string;
  content?: unknown;
  partial?: boolean;
  tasks?: PlanTask[];
  answers?: Record<string, { value: unknown }>;
  prompt?: string;
  messages?: { content: unknown }[];
  title?: string;
  status?: string;
  message?: string;
  requestId?: string;
  awaitingReply?: boolean;
  questions?: AskQuestion[];
  tool?: string;
  input?: unknown;
  arguments?: unknown;
  id?: string;
  [key: string]: unknown;
}
export interface RuntimeEvent {
  event_id?: string;
  session_id?: string;
  agent_id?: string;
  turn_id?: string;
  seq?: number;
  created_at?: string;
  payload: Payload;
}
export interface Routine {
  avatar?: string;
  id: string;
  name: string;
  prompt: string;
  agentId: string;
  schedule: 'daily' | 'weekdays' | 'interval';
  minutes: number;
  time: string;
  timezone: string;
  enabled: boolean;
  nextAt: number;
}
export interface Run {
  id: string;
  routineId: string;
  name: string;
  sessionId?: string;
  status: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}
export interface SavedFile {
  id: string;
  name: string;
  content: string;
  sessionId?: string;
  updatedAt: number;
}
export interface ChatInfo {
  archived?: boolean;
  avatar?: string;
  id: string;
  title: string;
  pinned?: boolean;
  kind?: string;
}
export interface ProductState {
  routines: Routine[];
  runs: Run[];
  files: SavedFile[];
  chats: ChatInfo[];
  runtime: string;
  alphaAvailable?: boolean;
}
export interface Environment {
  ID: string;
  Key: string;
  Spec: { Kind: string; Roots?: string[]; Host?: string; Image?: string };
  Workspaces?: { id: string; key?: string; cwd?: string; archived?: boolean }[];
  Revision: number;
}
export interface Input {
  text?: string;
  kind?: string;
  to?: string[];
  requestId?: string;
  answers?: Record<string, { value: unknown }>;
  images?: { mimeType: string; data: string; name: string }[];
}

export interface ReadingSummary {
  readSeq: number;
  unread: number;
  firstUnreadSeq?: number;
  latestSeq: number;
  preview: string;
  updatedAt?: string;
}
