import { atom, read, update } from 'claude-code';
import type { EngineInterface, SessionMessage } from 'claude-code';
import type { Language, Preferences, Task, Theme } from '../types';

export const preferences = atom({ plugin: 'super-sidebar', key: 'preferences' } as const,
  { language: 'zh', theme: 'white', revision: 0, loaded: false } as Preferences);

const words = {
  preferences: ['偏好设置', 'Preferences'], language: ['语言', 'Language'], theme: ['容器配色', 'Container color'],
  white: ['白色', 'White'], beige: ['米色', 'Beige'], black: ['黑色', 'Black'],
  selected: ['已选择', 'Selected'],
  agents: ['代理', 'Agents'], tasks: ['任务流', 'Task Flow'], refresh: ['刷新', 'Refresh'],
  expand: ['展开', 'Expand'], collapse: ['收起', 'Collapse'], main: ['主代理', 'Main agent'],
  mode: ['模式', 'Mode'], role: ['角色', 'Role'], model: ['模型', 'Model'],
  tokens: ['Token 用量', 'Token usage'], context: ['当前上下文', 'Current context'],
  tokenCumulative: ['会话累计（含缓存）', 'session total (incl. cache)'],
  tokenUnavailable: ['暂无已完成回合统计', 'No completed-turn usage observed'],
  contextUnavailable: ['当前会话未提供', 'Not provided for this session'],
  elapsed: ['当前耗时', 'Elapsed'], calls: ['工具调用', 'tool calls'], seconds: ['秒', 's'],
  parent: ['上级', 'Parent'], unavailable: ['暂无数据', 'Unavailable'],
  working: ['正在处理当前任务', 'Working on the current task'], activity: ['活动', 'Activity'],
  noActivity: ['暂无活动记录', 'No activity observed'],
  stepOrder: ['本轮已观测步骤 · 连线表示观测顺序', 'Observed steps for this request · lines show observed order'],
  emptyTasks: ['等待本轮工作步骤', 'Waiting for steps in this request'], plan: ['工作计划', 'Plan'],
  operationComplete: ['操作完成', 'Operations complete'], operations: ['操作', 'operations'],
  replyComplete: ['回复完成', 'Response complete'],
  moreOperations: ['其余操作已省略', 'Additional operations omitted'],
  verification: ['验证', 'Verification'], assistantReported: ['对话报告', 'Assistant-reported'],
  verificationUnknown: ['未记录验证结论', 'No verification conclusion recorded'], verificationPassed: ['通过', 'Passed'],
  verificationFailed: ['失败', 'Failed'], verificationSkipped: ['跳过', 'Skipped'],
  noPlan: ['计划正文尚未在对话中观测到。', 'Plan content has not been observed in the conversation yet.'],
  version: ['版本信息', 'Version'], pluginVersion: ['插件版本', 'Plugin version'], revision: ['实现修订', 'Implementation revision'],
  observedOnly: ['仅展示已观测数据；缺失值不代表零。', 'Observed data only; missing values do not mean zero.'],
  command: ['打开实时团队任务与代理关系面板', 'Open live agents and task flow'],
  opened: ['状态面板已打开。', 'Status pane opened.'],
  unplaced: ['面板已注册，等待客户端提供绘制位置。', 'Pane registered; waiting for the client to provide a placement.'],
} as const;
export const t = (lang: Language, key: keyof typeof words): string => words[key][lang === 'zh' ? 0 : 1];
export const paneTitle = (lang: Language) => lang === 'zh' ? '状态' : 'Status';
const statuses: Record<string, readonly [string, string]> = {
  running: ['运行中', 'Running'], pending: ['待开始', 'Pending'], waiting: ['等待中', 'Waiting'],
  idle: ['空闲', 'Idle'], completed: ['已完成', 'Completed'], failed: ['失败', 'Failed'],
  killed: ['已停止', 'Stopped'], in_progress: ['进行中', 'In progress'],
};
export const statusLabel = (lang: Language, status: string) => statuses[status]?.[lang === 'zh' ? 0 : 1] ?? status;
const generated: Record<string, string> = {
  '主会话': 'Main session', 'lead · 协调者': 'lead · Coordinator',
  '团队成员': 'Teammate', '后台子代理': 'Background subagent', '子代理': 'Subagent',
  '子代理（加载前启动）': 'Subagent (started before loading)',
  '等待活动': 'Waiting for activity', '执行失败': 'Execution failed', '已停止': 'Stopped', '已完成': 'Completed',
  '会话状态读取失败，保留上次观测。': 'Could not read session state; keeping the last observation.',
};
export const generatedLabel = (lang: Language, value: string) => lang === 'en' ? generated[value] ?? value : value;
export function activityLabel(lang: Language, value: string, messages: SessionMessage[]): string {
  if (lang === 'zh' || !value.startsWith('正在执行 ')) return generatedLabel(lang, value);
  const tool = value.slice('正在执行 '.length);
  const uses = messages.flatMap(message => message.toolUses ?? []);
  if (uses.some(use => use.input.description === value)) return value;
  return uses.some(use => use.tool === tool) ? `Running ${tool}` : value;
}

const operations: Record<string, string> = {
  '应用技能': 'Apply skill', '读取资源': 'Read resource', '跟进代理任务': 'Follow up agent task',
  '检查界面样式': 'Inspect interface styles', '检查运行日志': 'Inspect runtime logs',
  '检查服务日志': 'Inspect server logs', '检查网络请求': 'Inspect network requests',
  '读取文件': 'Read file', '修改文件': 'Edit file', '写入文件': 'Write file', '搜索代码': 'Search code',
  '查找文件': 'Find files', '执行命令': 'Run command', '执行子代理任务': 'Run subagent task',
  '制定工作计划': 'Prepare plan', '提交工作计划': 'Submit plan', '检查界面显示': 'Inspect interface',
  '执行系统操作': 'Run system operation', '读取网页': 'Read webpage', '搜索资料': 'Search the web',
  '检查侧栏布局': 'Inspect sidebar layout', '检查窗口布局': 'Inspect window layout',
  '操作界面控件': 'Use interface control', '查看界面内容': 'View interface content',
  '检查或调整窗口': 'Inspect or adjust window', '填写界面内容': 'Fill interface content',
  '检查界面内容': 'Inspect interface content', '处理工作步骤': 'Perform work step',
};
function translateOperation(lang: Language, title: string): string {
  if (lang === 'zh') return title;
  const split = title.indexOf('：');
  const operation = split < 0 ? title : title.slice(0, split);
  return operations[operation] ? operations[operation] + (split < 0 ? '' : `: ${title.slice(split + 1)}`) : title;
}
export function taskTitle(lang: Language, task: Task, _messages: SessionMessage[]): string {
  if (task.kind === 'plan') return t(lang, 'plan');
  return task.titleGenerated === true ? task.subject.split(' · ').map(title => translateOperation(lang, title)).join(' · ') : task.subject;
}
export function operationLabel(lang: Language, operation: { id: string; title: string }, messages: SessionMessage[]): string {
  const use = messages.flatMap((message, index) => (message.toolUses ?? []).map((use, useIndex) => ({
    use, id: use.tool_use_id || `${index}:${useIndex}`,
  }))).find(entry => entry.id === operation.id)?.use;
  // Supplied prose is never translated, even if it matches a fallback label.
  if (!use || [use.input.description, use.input.title, use.input.subject]
    .some(value => typeof value === 'string' && value.trim())) return operation.title;
  return translateOperation(lang, operation.title);
}
export const taskStatusLabel = (lang: Language, status: string) =>
  status === 'completed' ? t(lang, 'operationComplete') : statusLabel(lang, status);
export const verificationLabel = (lang: Language, status: string) =>
  t(lang, status === 'passed' ? 'verificationPassed' : status === 'failed' ? 'verificationFailed'
    : status === 'skipped' ? 'verificationSkipped' : 'verificationUnknown');

// Serialize disk writes per session so rapid toggles cannot persist out of order.
const saves = new Map<string, Promise<void>>();
const storageKey = (sessionId: string) => `preferences:${sessionId}`;
export async function loadPreferences($: EngineInterface): Promise<void> {
  const sessionId = await $.session.id();
  const before = await read($, preferences);
  if (before.sessionId === sessionId && before.loaded) return;
  if (await $.session.id() !== sessionId) return;
  const snapshot = await update($, preferences, current => current.sessionId === sessionId
    ? { ...current, loaded: true }
    : { sessionId, language: 'zh', theme: 'white', revision: 0, loaded: true });
  try {
    // Host declarations confirm store.get/set. Keys keep saved choices session-specific.
    const saved = await $.store.get(storageKey(sessionId));
    if (await $.session.id() !== sessionId) return;
    const savedLanguage = saved && typeof saved === 'object' && 'language' in saved ? saved.language : undefined;
    const savedTheme = saved && typeof saved === 'object' && 'theme' in saved ? saved.theme : undefined;
    const language = savedLanguage === 'en' ? 'en' : 'zh';
    // Older language-only records and invalid themes use the explicit white default.
    const theme = savedTheme === 'beige' || savedTheme === 'black' ? savedTheme : 'white';
    await update($, preferences, current => current.sessionId !== sessionId || current.revision !== snapshot.revision
      ? current : { ...current, language, theme });
  } catch { /* Preferences must never interfere with execution. */ }
}
async function switchPreferences($: EngineInterface, sessionId: string, choice: Partial<Pick<Preferences, 'language' | 'theme'>>): Promise<void> {
  if (await $.session.id() !== sessionId) return;
  const current = await update($, preferences, value => value.sessionId !== sessionId ? value
    : { ...value, ...choice, revision: value.revision + 1 });
  if (current.sessionId !== sessionId || await $.session.id() !== sessionId) return;
  const save = (saves.get(sessionId) ?? Promise.resolve()).then(async () => {
    if (await $.session.id() !== sessionId) return;
    // Read inside the queue: even callbacks queued in reverse order retain the newest pair.
    const latest = await read($, preferences);
    if (latest.sessionId !== sessionId || await $.session.id() !== sessionId) return;
    await $.store.set(storageKey(sessionId), { language: latest.language, theme: latest.theme ?? 'white' });
  }).catch(() => { /* Keep the in-session choice if saving fails. */ });
  saves.set(sessionId, save);
  await save;
  if (saves.get(sessionId) === save) saves.delete(sessionId);
  if (await $.session.id() === sessionId) {
    const latest = await read($, preferences);
    if (latest.sessionId === sessionId) await $.ui.open({ id: 'super-sidebar', title: paneTitle(latest.language) });
  }
}

export async function switchLanguage($: EngineInterface, sessionId: string, language: Language): Promise<void> {
  await switchPreferences($, sessionId, { language });
}
export async function switchTheme($: EngineInterface, sessionId: string, theme: Theme): Promise<void> {
  await switchPreferences($, sessionId, { theme });
}
