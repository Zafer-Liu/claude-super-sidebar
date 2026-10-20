import type { SessionMessage, ToolUseSummary } from 'claude-code';
import type { Task } from '../types';

const bounded = (value: string, limit = 60) => {
  const points = Array.from(value);
  return points.length > limit ? points.slice(0, limit - 1).join('') + '…' : value;
};
const plain = (value: string) => value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^[\s#>*\-]+/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const stripIntent = (value: string) => value.replace(/^(?:(?:I\s+(?:will|shall)|I['’]ll|I['’]m\s+going\s+to)\s+|我(?:会|将|打算|准备)\s*)/i, '');
export function proseTitle(prose: string): string {
  const value = stripIntent(plain(prose));
  return bounded(value.split(/[。！？!?]|\.(?=\s|$)/)[0]?.split(/[，,；;]/)[0]?.trim() || '', 42);
}
const toolName = (use: ToolUseSummary) => use.tool.replace(/^.*__/, '');
export function operationTitle(use: ToolUseSummary): { title: string; generated: boolean } {
  const supplied = [use.input.description, use.input.title, use.input.subject]
    .find(value => typeof value === 'string' && value.trim());
  if (typeof supplied === 'string') return { title: proseTitle(supplied), generated: false };
  const names: Record<string, string> = {
    Read: '读取文件', Edit: '修改文件', Write: '写入文件', Grep: '搜索代码', Glob: '查找文件',
    Bash: '执行命令', Agent: '执行子代理任务', EnterPlanMode: '制定工作计划', ExitPlanMode: '提交工作计划',
    Snapshot: '检查界面显示', Screenshot: '检查界面显示', PowerShell: '执行系统操作',
    WebFetch: '读取网页', WebSearch: '搜索资料', Skill: '应用技能',
    ReadMcpResourceTool: '读取资源', SendMessage: '跟进代理任务',
    preview_inspect: '检查界面样式', preview_console_logs: '检查运行日志',
    preview_logs: '检查服务日志', preview_network: '检查网络请求',
    get_layout: '检查侧栏布局', get_window_layout: '检查窗口布局',
    Click: '操作界面控件', click: '操作界面控件', mouse_click: '操作界面控件',
    preview_click: '操作界面控件', browser_click: '操作界面控件',
    Scroll: '查看界面内容', mouse_scroll: '查看界面内容',
    Windows: '检查或调整窗口', Type: '填写界面内容',
    preview_snapshot: '检查界面内容', browser_snapshot: '检查界面内容',
    preview_screenshot: '检查界面显示', screenshot: '检查界面显示',
  };
  // Never surface commands, results, or arbitrary tool identifiers as titles.
  const target = use.input.file_path || use.input.path || (toolName(use) === 'Skill' ? use.input.skill : undefined);
  const file = typeof target === 'string' ? target.split(/[\\/]/).filter(Boolean).pop() : '';
  return { title: bounded(`${names[toolName(use)] || '处理工作步骤'}${file ? `：${file}` : ''}`), generated: true };
}
export function operationSubject(operations: Array<{ title: string }>): string {
  const titles = [...new Set(operations.map(operation => operation.title).filter(Boolean))];
  return titles.slice(0, 2).join(' · ');
}
export function summaryBody(prose: string): string {
  const text = prose.trim();
  const end = /[。！？!?]|\.(?=\s|$)/.exec(text);
  const first = end ? text.slice(0, end.index + end[0].length) : text;
  // Keep a substantive first sentence; omit it only when the title carries it all.
  return plain(first).replace(/[。！？!?.]$/, '') === proseTitle(text)
    ? text.slice(first.length).trim() : text;
}
const shortResult = (prose: string) => Array.from(prose).length <= 240
  && !/[\n]\s*(?:[-*#]|\d+[.)])|\b(summary|overall|recap|all tasks)\b|总结|综上|全部|所有/i.test(prose)
  && prose.split(/[。！？!?]|\.(?=\s|$)/).filter(value => value.trim()).length <= 2
  && /\b(passed|failed|skipped|completed|finished|updated|fixed|found|confirmed|verified)\b|已(?:完成|修改|更新|修复|确认|找到)|通过|失败|跳过/i.test(prose);
export function verification(prose: string): NonNullable<Task['verification']> {
  const unknown = { status: 'unknown' as const };
  if (!shortResult(prose) || Array.from(prose).length > 200
    || !/\b(test(?:s|ing)?|checks?|build|lint|typecheck|validation|verification)\b|验证|检查|测试|构建/i.test(prose)
    || /\b(?:will|shall|would|should|could|may|might|plan|not|never|no|without|but|however|and|or)\b|未(?:验证|测试|检查|运行|完成|通过|成功)|没有|尚未|不能|无法|不会|不(?:确定|清楚|一致|通过|成功)|将|准备|计划|但是|但|可能|如果/i.test(prose)) return unknown;
  const passed = /\b(passed|passing|succeeded)\b|通过|验证成功|检查成功|测试成功|构建成功/i.test(prose);
  const failed = /\b(failed|failing)\b|失败/i.test(prose);
  const skipped = /\b(skipped)\b|跳过/i.test(prose);
  if (Number(passed) + Number(failed) + Number(skipped) !== 1) return unknown;
  return { status: passed ? 'passed' : failed ? 'failed' : 'skipped', evidence: prose, source: 'assistant' };
}
// Transcript fallback; live responses use turn.step IDs in register.tsx.
export function conversationSteps(messages: SessionMessage[]): Task[] {
  const steps: Task[] = [];
  let planText = '';
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      if (!message.toolResults?.length && message.text.trim()) { steps.length = 0; planText = ''; }
      continue;
    }
    const prose = message.text.trim();
    const uses = message.toolUses ?? [];
    if (!prose && !uses.length) continue;
    const planUse = uses.find(use => toolName(use) === 'ExitPlanMode');
    const labels = uses.map(operationTitle);
    const fallback = { title: operationSubject(labels), generated: labels.every(label => label.generated) };
    const operations = uses.map((use, i) => ({
      id: use.tool_use_id || `${index}:${i}`, title: operationTitle(use).title,
      status: use.isError ? 'failed' : use.text === undefined && use.result === undefined ? 'in_progress' : 'completed',
    }));
    for (const use of uses) {
      if (toolName(use) === 'Write' && typeof use.input.file_path === 'string'
        && /[\\/]plans[\\/].*\.md$/.test(use.input.file_path) && typeof use.input.content === 'string' && !use.isError) planText = use.input.content;
    }
    steps.push({ id: `conversation:${index}`, kind: planUse ? 'plan' : 'stage',
      subject: planUse ? '工作计划 · Plan' : proseTitle(prose) || fallback.title,
      titleGenerated: Boolean(planUse) || (!prose && fallback.generated),
      summary: planUse ? (typeof planUse.input.plan === 'string' ? planUse.input.plan : planText || prose) : prose.slice(0, 2400),
      status: operations.some(op => op.status === 'failed') ? 'failed'
        : operations.some(op => op.status === 'in_progress') ? 'in_progress' : 'completed',
      source: 'panel', operations: operations.slice(0, 40), operationCount: operations.length,
      verification: verification(prose),
    });
  }
  return steps.slice(-30);
}
