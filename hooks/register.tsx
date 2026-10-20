import { atom, update } from 'claude-code';
import type { Register, EngineInterface } from 'claude-code';
import { initial, mergeMembers } from './model';
import { drawPanel } from './pane';
import { conversationSteps } from './steps';

const panel = atom({ plugin: 'team-panel', key: 'panel' } as const, initial);
const pane = 'team-panel';
const observe = async (action: () => Promise<unknown>) => {
  try { await action(); } catch { /* Panel failures must never affect execution. */ }
};

// Refreshes are serialized so an older roster response cannot overwrite a newer one.
const refreshing = new WeakSet<EngineInterface>();
const activeTools = new WeakMap<EngineInterface, Map<string, Map<symbol, string>>>();
const refresh = async ($: EngineInterface) => {
    if (refreshing.has($)) return;
    refreshing.add($);
    try {
      const sessionId = await $.session.id();
      const agents = await $.agent.list();
      const messages = await $.session.messages();
      const steps = conversationSteps(messages);
      const cwd = await $.session.cwd();
      const model = await $.session.model();
      const usage = await $.session.usage();
      if (await $.session.id() !== sessionId) return;
      await update($, panel, p => p.sessionId !== sessionId ? p : ({ ...p, members: mergeMembers(p.members, agents, Date.now()),
        tasks: steps, taskNotice: undefined,
        project: cwd.split(/[\\/]/).filter(Boolean).pop() || cwd, mainModel: model,
        mainContextTokens: usage.context.tokens, mainStartedAt: p.mainStartedAt ?? Date.now(),
        error: '', updatedAt: Date.now() }));
    } catch {
      await observe(() => update($, panel, p => ({ ...p, error: '会话状态读取失败，保留上次观测。' })));
    } finally { refreshing.delete($); }
  };
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await observe(async () => {
      const sessionId = await $.session.id();
      await update($, panel, p => {
        if (p.sessionId === sessionId) return p;
        activeTools.delete($);
        return { ...initial, members: [], tasks: [], sessionId };
      });
      await $.command.register({ name: 'team-panel', description: '打开实时团队任务与代理关系面板' });
      await update($, panel, p => ({ ...p, project: e.cwd.split(/[\\/]/).filter(Boolean).pop() || e.cwd }));
      await refresh($);
      $.clock.every(2000, () => { void refresh($); });
      await $.ui.open({ id: pane, title: '状态 · Status' });
    });
    return next(e);
  });
  on('command.run', { command: 'team-panel' }, async $ => {
    await refresh($);
    const placed = await $.ui.open({ id: pane, title: '状态 · Status' });
    return { text: placed.isPlaced ? '状态面板已打开。' : '面板已注册，等待桌面客户端提供绘制位置。' };
  });
  on('agent.spawn', async ($, e, next) => {
    const sessionId = await $.session.id().catch(() => undefined);
    const result = await next(e);
    await observe(async () => {
      await refresh($);
      if (result.agentId) await update($, panel, p => p.sessionId !== sessionId ? p : ({ ...p, members: p.members.map(m => m.id === result.agentId
        ? { ...m, model: result.model, mode: e.isTeammate ? '团队成员' : e.background ? '后台子代理' : '子代理', role: e.isTeammate ? 'teammate' : e.subagentType || m.type } : m) }));
    });
    return result;
  });
  on('turn.start', async ($, e, next) => {
    await observe(async () => {
      await update($, panel, p => e.agentId ? ({ ...p, members: p.members.map(m => m.id === e.agentId
        ? { ...m, activeStartedAt: Date.now(), currentDurationMs: undefined } : m) })
        : ({ ...p, mainStatus: 'running', mainActiveStartedAt: Date.now(), mainCurrentDurationMs: undefined }));
      await refresh($);
    });
    return next(e);
  });
  on('turn.complete', async ($, e, next) => {
    await observe(async () => {
      const sessionId = await $.session.id();
      await refresh($);
      const status = e.reason === 'error' || e.reason === 'refusal' ? 'failed' : e.isAborted ? 'killed' : 'completed';
      const recent = status === 'failed' ? '执行失败' : status === 'killed' ? '已停止' : '已完成';
      const tokens = e.usage ? e.usage.input_tokens + e.usage.output_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens : undefined;
      await update($, panel, p => p.sessionId !== sessionId ? p : e.agentId ? ({
        ...p, members: p.members.map(m => m.id === e.agentId ? {
          ...m, status: m.type === 'teammate' && status === 'completed' ? 'idle' : status,
          recent, tool: undefined, endedAt: Date.now(), activeStartedAt: undefined, currentDurationMs: e.durationMs,
          tokens: tokens === undefined ? m.tokens : (m.tokens ?? 0) + tokens,
          durationMs: (m.durationMs ?? 0) + e.durationMs,
        } : m),
      }) : ({ ...p, mainStatus: status, mainRecent: recent, mainTool: undefined, mainActiveStartedAt: undefined, mainCurrentDurationMs: e.durationMs,
        mainTokens: tokens === undefined ? p.mainTokens : (p.mainTokens ?? 0) + tokens,
        mainDurationMs: (p.mainDurationMs ?? 0) + e.durationMs }));
    });
    return next(e);
  });
  on('tool.call', async ($, e, next) => {
    const sessionId = await $.session.id().catch(() => undefined);
    const name = String(e.tool), agentId = e.agentId;
    const args = e as unknown as Record<string, unknown>;
    const activity = typeof args.description === 'string' ? args.description : `正在执行 ${name}`;
    const scope = agentId || 'main', invocation = Symbol(name);
    const engineTools = activeTools.get($) ?? new Map<string, Map<symbol, string>>();
    const agentTools = engineTools.get(scope) ?? new Map<symbol, string>();
    activeTools.set($, engineTools); engineTools.set(scope, agentTools);
    agentTools.set(invocation, activity);
    // Observation failures must never block or replace the user's tool execution.
    try {
      await update($, panel, p => p.sessionId !== sessionId ? p : agentId ? ({ ...p, members: p.members.map(m => m.id === agentId
        ? { ...m, tool: activity, calls: m.calls + 1 } : m) }) : ({ ...p, mainRecent: `正在执行 ${name}`, mainTool: activity, mainCalls: (p.mainCalls ?? 0) + 1 }));
    } catch { /* Keep the tool path independent of the panel. */ }
    try {
      return await next(e);
    } finally {
      agentTools.delete(invocation);
      const latest = [...agentTools.values()].at(-1);
      if (!agentTools.size) engineTools.delete(scope);
      if (!engineTools.size && activeTools.get($) === engineTools) activeTools.delete($);
      try {
      await update($, panel, p => p.sessionId !== sessionId ? p : agentId ? ({ ...p, members: p.members.map(m => m.id === agentId
        ? { ...m, tool: latest } : m) }) : ({ ...p, mainTool: latest }));
      if (await $.session.id() === sessionId) await refresh($);
      } catch { /* Display failures must never replace a tool outcome. */ }
    }
  });
  on('ui.render', { component: 'Pane', requestId: pane }, ($, e) => drawPanel($, e, () => refresh($)));
};
