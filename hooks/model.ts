import type { Member, Panel, Task } from '../types';
import { linkPath } from './connector';

export const initial: Panel = {
  members: [], tasks: [], selected: 'main', filter: 'all', view: 'tree',
  mainStatus: 'idle', mainRecent: '等待活动', project: '', error: '', updatedAt: 0,
};
export const label = (status: string) => ({
  running: '运行中', pending: '待开始', waiting: '等待中', idle: '空闲',
  completed: '已完成', failed: '失败', killed: '已停止', in_progress: '进行中',
}[status] ?? status);
export const color = (status: string) => ({
  running: '#26b47c', in_progress: '#26b47c', failed: '#e16d78',
  killed: '#b48a56', completed: '#6386ec', waiting: '#b48a56',
}[status] ?? '#8994a5');
export const text = (value: unknown, limit = 160): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').slice(0, limit) : '';
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function mergeMembers(old: Member[], live: Array<{
  id: string; name?: string; description: string; type: string; status: string; parentId?: string;
}>, now: number): Member[] {
  const map = new Map(old.map(m => [m.id, m]));
  for (const agent of live) {
    const previous = map.get(agent.id);
    map.set(agent.id, {
      ...previous, id: agent.id, name: agent.name || agent.type,
      description: agent.description, type: agent.type, parentId: agent.parentId,
      status: agent.status, observedAt: previous?.observedAt ?? now,
      calls: previous?.calls ?? 0, recent: previous?.recent ?? '',
      endedAt: ['completed', 'failed', 'killed'].includes(agent.status)
        ? previous?.endedAt ?? now : undefined,
    });
  }
  // Missing from a later roster is not proof of completion. Keep the last observation.
  return [...map.values()].slice(-200);
}

export function collectTasks(existing: Task[], tool: string, input: unknown, output: unknown): Task[] {
  const args = record(input);
  const map = new Map(existing.map(t => [t.id, t]));

  const result = record(output);
  if (tool === 'TaskList' && Array.isArray(result.tasks)) {
    return [...existing.filter(t => t.source === 'panel'), ...result.tasks.flatMap(raw => {
      const t = record(raw);
      return typeof t.id === 'string' && typeof t.subject === 'string'
        ? [{ id: t.id, subject: t.subject, status: text(t.status) || 'pending', owner: text(t.owner) || undefined,
          blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy.filter((id): id is string => typeof id === 'string') : [] }] : [];
    })];
  }
  if (tool === 'TaskCreate') {
    const t = record(result.task);
    if (typeof t.id === 'string') map.set(t.id, {
      id: t.id, subject: text(t.subject || args.subject), status: 'pending',
      summary: text(t.summary || args.summary || args.description),
    });
  }
  if (tool === 'TaskUpdate' && result.success === true && typeof args.taskId === 'string') {
    const previous = map.get(args.taskId);
    if (args.status === 'deleted') map.delete(args.taskId);
    else map.set(args.taskId, {
      id: args.taskId, subject: text(args.subject) || previous?.subject || `任务 ${args.taskId}`,
      status: text(args.status) || previous?.status || 'pending',
      owner: typeof args.owner === 'string' ? args.owner : previous?.owner,
      summary: text(args.summary) || previous?.summary,
      blockedBy: [...new Set([...(previous?.blockedBy ?? []),
        ...(Array.isArray(args.addBlockedBy) ? args.addBlockedBy.filter((id): id is string => typeof id === 'string') : [])])],
    });
  }
  if (tool === 'TodoWrite' && Array.isArray(result.newTodos)) {
    for (const id of map.keys()) if (id.startsWith('todo:')) map.delete(id);
    result.newTodos.forEach((raw, i) => {
      const t = record(raw);
      map.set(`todo:${i}`, { id: `todo:${i}`, subject: text(t.content), status: text(t.status) });
    });
  }
  return [...map.values()].slice(-300);
}

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[c]!));
const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

// Compact depth-first tree: stable sibling order, explicit cycle and orphan handling.
export function treeRows(members: Member[]): Array<{ member: Member; depth: number }> {
  const ids = new Set(members.map(m => m.id));
  const rows: Array<{ member: Member; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (m: Member, depth: number) => {
    if (seen.has(m.id)) return;
    seen.add(m.id); rows.push({ member: m, depth });
    for (const child of members) if (child.parentId === m.id) walk(child, depth + 1);
  };
  for (const m of members) if (!m.parentId || !ids.has(m.parentId)) walk(m, 1);
  for (const m of members) if (!seen.has(m.id)) walk(m, 1);
  return rows;
}

export function diagram(panel: Panel): string {
  const rows = treeRows(panel.members);
  const width = 520, height = 142 + rows.length * 122;
  const positions = new Map<string, { x: number; y: number }>([['main', { x: 20, y: 16 }]]);
  rows.forEach(({ member, depth }, i) => positions.set(member.id, { x: 20 + Math.min(depth, 5) * 22, y: 142 + i * 122 }));
  const cards = [{ id: 'main', name: '主代理', description: panel.project || '当前会话',
    status: panel.mainStatus, recent: panel.mainRecent, type: 'lead', calls: 0, observedAt: 0 }, ...rows.map(r => r.member)];
  const lines = rows.map(({ member }) => {
    const at = positions.get(member.id)!;
    const parent = positions.get(member.parentId || 'main') || positions.get('main')!;
    return `<path d="M${parent.x + 10} ${parent.y + 106} V${at.y - 12} ${linkPath(parent.x + 10, at.y - 12, at.x, at.y + 52)}" fill="none" stroke="#7890c2" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="4 5"/>`;
  }).join('');
  const nodes = cards.map(m => {
    const p = positions.get(m.id)!, w = width - p.x - 18;
    const selected = panel.selected === m.id;
    return `<g><title>${escape(m.description + ' — ' + label(m.status))}</title>
      <rect x="${p.x}" y="${p.y}" width="${w}" height="106" rx="12" fill="${selected ? '#edf3ff' : '#f7f9fd'}" stroke="${selected ? '#5680ec' : '#cbd5e6'}" stroke-width="${selected ? 2 : 1}"/>
      <circle cx="${p.x + 18}" cy="${p.y + 23}" r="4" fill="${color(m.status)}"/>
      <text x="${p.x + 30}" y="${p.y + 28}" font-size="15" font-weight="600" fill="#24334e">${escape(short(m.name, 30))}</text>
      <text x="${p.x + w - 16}" y="${p.y + 28}" text-anchor="end" font-size="12" fill="${color(m.status)}">${escape(label(m.status))}</text>
      <text x="${p.x + 16}" y="${p.y + 56}" font-size="13" fill="#41516b">${escape(short(m.description, 29))}</text>
      <path d="M${p.x} ${p.y + 73} H${p.x + w}" stroke="#dce3f0"/>
      <text x="${p.x + 16}" y="${p.y + 94}" font-size="12" fill="#71809a">${escape(short(m.tool || m.recent || '暂无活动记录', 35))}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><style>text{font-family:system-ui,"Microsoft YaHei",sans-serif}</style>${lines}${nodes}</svg>`;
}
