export type Member = {
  id: string;
  name: string;
  description: string;
  type: string;
  parentId?: string;
  status: string;
  observedAt: number;
  endedAt?: number;
  activeStartedAt?: number;
  currentDurationMs?: number;
  model?: string;
  mode?: string;
  role?: string;
  tokens?: number;
  durationMs?: number;
  tool?: string;
  calls: number;
  recent: string;
};
export type Task = {
  id: string;
  subject: string;
  status: string;
  owner?: string;
  blockedBy?: string[];
  source?: 'panel' | 'host';
  summary?: string;
};
export type Panel = {
  sessionId?: string;
  members: Member[];
  tasks: Task[];
  selected: string;
  filter: string;
  view: 'tree' | 'list';
  mainStatus: string;
  mainRecent: string;
  project: string;
  error: string;
  updatedAt: number;
  mainModel?: string;
  mainTokens?: number;
  mainContextTokens?: number;
  mainStartedAt?: number;
  mainDurationMs?: number;
  mainActiveStartedAt?: number;
  mainCurrentDurationMs?: number;
  mainCalls?: number;
  mainTool?: string;
  taskNotice?: string;
};
declare module 'claude-code' {
  interface PluginState {
    'team-panel': { panel: Panel };
  }
}
