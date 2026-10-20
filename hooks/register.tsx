import { atom, read, update } from 'claude-code';
import type { Register, EngineInterface } from 'claude-code';
import { initial, mergeMembers } from './model';
import { drawPanel } from './pane';
import { conversationSteps, proseTitle, operationTitle, operationSubject, verification } from './steps';
import { loadPreferences, paneTitle, t } from './i18n';

const panel = atom({ plugin: 'team-panel', key: 'panel' } as const, initial);
const pane = 'team-panel';
const preferences = atom({ plugin: 'team-panel', key: 'preferences' } as const, { language: 'zh', theme: 'white', revision: 0, loaded: false } as import('../types').Preferences);
const observe = async (action: () => Promise<unknown>) => {
  try { await action(); } catch { /* Panel failures must never affect execution. */ }
};

// Runtime coordination uses session IDs; the host engine object cannot escape into collections.
const refreshing = new Set<string>();
const activeTools = new Map<string, Map<string, Map<symbol, string>>>();
const refresh = async ($: EngineInterface) => {
    const sessionId = await $.session.id();
    if (refreshing.has(sessionId)) return;
    refreshing.add(sessionId);
    try {
      const agents = await $.agent.list();
      const messages = await $.session.messages();
      const steps = conversationSteps(messages);
      const cwd = await $.session.cwd();
      const model = await $.session.model();
      const usage = await $.session.usage();
      if (await $.session.id() !== sessionId) return;
      await update($, panel, p => p.sessionId !== sessionId ? p : ({ ...p, members: mergeMembers(p.members, agents, Date.now()),
        tasks: p.liveTurnId ? p.tasks : steps, taskNotice: undefined,
        project: cwd.split(/[\\/]/).filter(Boolean).pop() || cwd, mainModel: model,
        mainContextTokens: usage.context.tokens, mainStartedAt: p.mainStartedAt ?? Date.now(),
        error: '', updatedAt: Date.now() }));
    } catch {
      await observe(() => update($, panel, p => ({ ...p, error: '会话状态读取失败，保留上次观测。' })));
    } finally { refreshing.delete(sessionId); }
  };
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await observe(async () => {
      const sessionId = await $.session.id();
      await update($, panel, p => {
        if (p.sessionId === sessionId) return p;
        activeTools.delete(sessionId);
        return { ...initial, members: [], tasks: [], sessionId };
      });
      await loadPreferences($);
      const pref = await read($, preferences);
      const language = pref.sessionId === sessionId ? pref.language : 'zh';
      await $.command.register({ name: 'team-panel', description: t(language, 'command') });
      await update($, panel, p => ({ ...p, project: e.cwd.split(/[\\/]/).filter(Boolean).pop() || e.cwd }));
      await refresh($);
      $.clock.every(2000, () => { void refresh($); });
      await $.ui.open({ id: pane, title: paneTitle(language) });
    });
    return next(e);
  });
  on('command.run', { command: 'team-panel' }, async $ => {
    await refresh($);
    await loadPreferences($);
    const sessionId = await $.session.id();
    const pref = await read($, preferences);
    const language = pref.sessionId === sessionId ? pref.language : 'zh';
    const placed = await $.ui.open({ id: pane, title: paneTitle(language) });
    return { text: t(language, placed.isPlaced ? 'opened' : 'unplaced') };
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
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e);
    const sessionId = await $.session.id();
    const id = `response:${e.turnId}:${e.index}`;
    let answer = '', lastPaint = 0;
    let requested: Array<{ title: string; generated: boolean }> = [];
    const paint = async (finished = false, hasTools = false, failed = false) => observe(async () => {
      await update($, panel, p => {
        if (p.sessionId !== sessionId || p.liveTurnId !== e.turnId) return p;
        const previous = p.tasks.find(task => task.id === id);
        const stage = { ...previous, id, kind: 'stage' as const, source: 'panel' as const,
          subject: proseTitle(answer) || operationSubject(requested.length ? requested : previous?.operations ?? []),
          titleGenerated: !answer.trim() && requested.every(label => label.generated),
          summary: answer.slice(0, 2400),
          status: failed ? 'failed' : finished && !hasTools ? 'completed' : 'in_progress',
          operations: previous?.operations ?? [], operationCount: previous?.operationCount ?? 0,
          verification: finished ? verification(answer) : { status: 'unknown' as const },
        };
        return { ...p, tasks: [...p.tasks.filter(task => task.id !== id), stage].slice(-30) };
      });
    });
    await paint();
    const stream = next(e);
    try {
      while (true) {
        const item = await stream.next();
        if (item.done) {
          answer = item.value.answer;
          requested = item.value.toolUses.map(use => operationTitle({ tool: use.name, tool_use_id: '',
            input: use.input && typeof use.input === 'object' ? use.input as Record<string, unknown> : {} }));
          await paint(true, item.value.toolUses.length > 0);
          return item.value;
        }
        // Forward the stream unchanged; only visible text is observed.
        const chunk = item.value;
        yield chunk;
        if (chunk.kind === 'text') {
          answer = (answer + chunk.text).slice(0, 12000);
          if (Date.now() - lastPaint >= 250) { lastPaint = Date.now(); await paint(); }
        }
      }
    } catch (error) {
      await paint(true, false, true);
      throw error;
    } finally { await stream.return(undefined as never); }
  });
  on('turn.start', async ($, e, next) => {
    await observe(async () => {
      await update($, panel, p => e.agentId ? ({ ...p, members: p.members.map(m => m.id === e.agentId
        ? { ...m, activeStartedAt: Date.now(), currentDurationMs: undefined } : m) })
        : ({ ...p, mainStatus: 'running', mainActiveStartedAt: Date.now(), mainCurrentDurationMs: undefined, liveTurnId: e.turnId, tasks: [] }));
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
      }) : ({ ...p, mainStatus: status, mainRecent: recent, mainTool: undefined, tasks: p.tasks.map(task => task.status !== 'in_progress' ? task : ({ ...task, status: status === 'completed' ? 'unknown' : status })), mainActiveStartedAt: undefined, mainCurrentDurationMs: e.durationMs,
        mainTokens: tokens === undefined ? p.mainTokens : (p.mainTokens ?? 0) + tokens,
        mainDurationMs: (p.mainDurationMs ?? 0) + e.durationMs }));
    });
    return next(e);
  });
  on('tool.call', async ($, e, next) => {
    const sessionId = await $.session.id().catch(() => undefined);
    if (!sessionId) return next(e);
    const name = String(e.tool), agentId = e.agentId;
    const args = e as unknown as Record<string, unknown>;
    const activity = typeof args.description === 'string' ? args.description : `正在执行 ${name}`;
    const scope = agentId || 'main', invocation = Symbol(name);
    const engineTools = activeTools.get(sessionId) ?? new Map<string, Map<symbol, string>>();
    const agentTools = engineTools.get(scope) ?? new Map<symbol, string>();
    activeTools.set(sessionId, engineTools); engineTools.set(scope, agentTools);
    agentTools.set(invocation, activity);
    let stageId = '';
    if (!agentId) await observe(async () => {
      const input = { ...args };
      const label = operationTitle({ tool: name, tool_use_id: e.tool_use_id, input });
      await update($, panel, p => {
        if (p.sessionId !== sessionId) return p;
        const stage = p.tasks.at(-1);
        if (!stage || !p.liveTurnId) return p;
        stageId = stage.id;
        const operations = [...(stage.operations ?? []).filter(op => op.id !== e.tool_use_id),
          { id: e.tool_use_id, title: label.title, status: 'in_progress' }];
        return { ...p, tasks: p.tasks.map(task => task.id !== stageId ? task : { ...task,
          subject: task.summary?.trim() ? task.subject : operationSubject(operations),
          titleGenerated: task.summary?.trim() ? task.titleGenerated : task.titleGenerated !== false && label.generated,
          status: 'in_progress', operations: operations.slice(0, 40), operationCount: (task.operationCount ?? 0) + 1 }) };
      });
    });
    // Observation failures must never block or replace the user's tool execution.
    try {
      await update($, panel, p => p.sessionId !== sessionId ? p : agentId ? ({ ...p, members: p.members.map(m => m.id === agentId
        ? { ...m, tool: activity, calls: m.calls + 1 } : m) }) : ({ ...p, mainRecent: `正在执行 ${name}`, mainTool: activity, mainCalls: (p.mainCalls ?? 0) + 1 }));
    } catch { /* Keep the tool path independent of the panel. */ }
    let toolStatus = 'failed';
    try {
      const result = await next(e);
      toolStatus = result.isError || 'deny' in result ? 'failed' : 'completed';
      return result;
    } finally {
      if (stageId) await observe(async () => {
        await update($, panel, p => p.sessionId !== sessionId ? p : { ...p, tasks: p.tasks.map(task => {
          if (task.id !== stageId) return task;
          const operations = (task.operations ?? []).map(op => op.id === e.tool_use_id ? { ...op, status: toolStatus } : op);
          return { ...task, operations, status: operations.some(op => op.status === 'failed') ? 'failed'
            : operations.some(op => op.status === 'in_progress') ? 'in_progress' : 'completed' };
        }) });
      });
      agentTools.delete(invocation);
      const latest = [...agentTools.values()].at(-1);
      if (!agentTools.size) engineTools.delete(scope);
      if (!engineTools.size && activeTools.get(sessionId) === engineTools) activeTools.delete(sessionId);
      try {
      await update($, panel, p => p.sessionId !== sessionId ? p : agentId ? ({ ...p, members: p.members.map(m => m.id === agentId
        ? { ...m, tool: latest } : m) }) : ({ ...p, mainTool: latest }));
      if (await $.session.id() === sessionId) await refresh($);
      } catch { /* Display failures must never replace a tool outcome. */ }
    }
  });
  on('ui.render', { component: 'Pane', requestId: pane }, ($, e) => drawPanel($, e, () => refresh($)));
};
