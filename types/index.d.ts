export type Language = 'zh' | 'en';
export type Theme = 'white' | 'beige' | 'black';
export type Preferences = {
  sessionId?: string;
  language: Language;
  theme: Theme;
  revision: number;
  loaded: boolean;
};
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
  kind?: 'stage' | 'plan';
  operations?: Array<{ id: string; title: string; status: string }>;
  operationCount?: number;
  verification?: {
    status: 'unknown' | 'passed' | 'failed' | 'skipped';
    evidence?: string;
    source?: 'assistant';
  };
  titleGenerated?: boolean;
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
  liveTurnId?: string;
};
declare module 'claude-code' {
  interface PluginState {
    'team-panel': { panel: Panel; preferences: Preferences };
  }
}
