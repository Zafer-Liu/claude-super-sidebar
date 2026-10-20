import type { SessionMessage, ToolUseSummary } from 'claude-code';
import type { Task } from '../types';
import { text } from './model';

function operationTitle(use: ToolUseSummary): string {
  const args = use.input;
  const description = text(args.description || args.title || args.subject);
  if (description) return description;
  const name = use.tool.replace(/^.*__/, '');
  const names: Record<string, string> = {
    Read: '读取文件', Edit: '修改文件', Write: '写入文件', Grep: '搜索代码', Glob: '查找文件',
    Bash: '执行命令', Agent: '执行子代理任务', EnterPlanMode: '制定工作计划', ExitPlanMode: '提交工作计划',
    Snapshot: '检查界面显示', Screenshot: '检查界面显示', PowerShell: '执行系统操作',
    WebFetch: '读取网页', WebSearch: '搜索资料',
  };
  const target = text(args.file_path || args.path || args.pattern || args.url);
  const file = target.split(/[\\/]/).filter(Boolean).pop();
  return `${names[name] || name}${file ? `：${file}` : ''}`;
}

// Text-only progress messages describe the tool-only messages that follow them.
export function conversationSteps(messages: SessionMessage[]): Task[] {
  const steps: Task[] = [];
  let current: Task | undefined;
  let pendingProse = '';
  let planText = '';
  let pendingInGroup = false;
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      // Tool results are user-role messages too; they do not start a new request.
      if (!message.toolResults?.length && message.text.trim()) {
        steps.length = 0;
        planText = '';
        current = undefined;
        pendingProse = '';
        pendingInGroup = false;
      }
      continue;
    }
    const prose = message.text.trim();
    const uses = message.toolUses ?? [];
    if (prose) {
      pendingProse = prose;
      current = undefined;
    }
    if (!uses.length) continue;
    if (!current) {
      const explanation = prose || pendingProse;
      const subject = operationTitle(uses[0]).slice(0, 120);
      const normalized = (value: string) => value.replace(/[\s。.!！:：]+/g, '');
      current = { id: `conversation:${index}`, subject,
        summary: normalized(explanation) === normalized(subject) ? undefined : explanation || undefined,
        status: 'in_progress', source: 'panel' };
      steps.push(current);
      pendingProse = '';
      pendingInGroup = false;
    }
    const failed = uses.some(use => use.isError);
    const pending = uses.some(use => use.text === undefined && use.result === undefined && !use.isError);
    pendingInGroup ||= pending;
    current.status = failed || current.status === 'failed' ? 'failed' : pendingInGroup ? 'in_progress' : 'completed';
    for (const use of uses) {
      const path = typeof use.input.file_path === 'string' ? use.input.file_path : '';
      if (use.tool === 'Write' && /[\\/]plans[\\/].*\.md$/.test(path) && typeof use.input.content === 'string' && !use.isError) {
        planText = use.input.content;
      }
      if (use.tool === 'ExitPlanMode') {
        current.subject = '工作计划 · Plan';
        current.summary = typeof use.input.plan === 'string' ? use.input.plan : planText || prose || '计划正文尚未在对话中观测到。';
      }
    }
  }
  return steps.slice(-30);
}
