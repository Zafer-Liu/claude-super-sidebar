// Read-only adapter for Codex rollout JSONL (CLI/App). This is a versioned local
// format, not the app-server wire protocol. Unknown records are intentionally ignored.
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const clean = (value, limit = 240) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : '';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const toolName = name => clean(name).split(/__|\./).pop() || '';
const titles = {
  exec_command: '执行命令', write_stdin: '跟进命令', apply_patch: '修改文件',
  update_plan: '更新工作计划', spawn_agent: '启动子代理', send_message: '发送代理消息',
  followup_task: '跟进子代理', wait_agent: '等待子代理', wait: '等待执行结果',
  view_image: '查看图片', web: '搜索资料', imagegen: '生成图片',
  exec: '执行工具操作', js: '执行页面操作',
  get_layout: '检查侧栏布局', get_window_layout: '检查窗口布局',
  Screenshot: '检查界面显示', screenshot: '检查界面显示', Snapshot: '检查界面显示',
  Click: '操作界面控件', mouse_click: '操作界面控件', Scroll: '查看界面内容',
  Read: '读取文件', Edit: '修改文件', Write: '写入文件', Grep: '搜索代码', Glob: '查找文件',
  Bash: '执行命令', PowerShell: '执行系统操作', WebFetch: '读取网页', WebSearch: '搜索资料',
};

function argsOf(item) {
  const value = item.arguments ?? item.input;
  if (typeof value !== 'string') return object(value);
  try { return object(JSON.parse(value)); } catch { return {}; }
}

// Generated labels stay separate from assistant prose so clients can localize them.
const categories = {
  view_image: 'inspect', web: 'inspect', apply_patch: 'modify',
  exec_command: 'execute', write_stdin: 'execute', exec: 'execute', js: 'execute',
  spawn_agent: 'delegate', send_message: 'delegate', followup_task: 'delegate',
  wait_agent: 'delegate', wait: 'delegate', update_plan: 'plan', imagegen: 'modify',
};
const plain = value => clean(value, 1000).replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]*>/g, '').replace(/^[ \t]*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
  .replace(/[*_`~]/g, '').trim();
const actionPrefix = /^(?:(?:I\s+(?:will|shall)|I['’]m\s+going\s+to)\s+|(?:Next|Now)[,:]?\s+I\s+will\s+|我(?:会|将|打算|准备)\s*|(?:接下来|下一步|现在)(?:我)?(?:会|将)?[，,：:\s]*)/i;
const actionVerb = /(?:inspect|read|check|search|review|update|edit|fix|implement|run|test|build|verify|add|remove|create|compare|trace|open|查看|读取|检查|搜索|审查|更新|修改|修复|实现|运行|测试|构建|验证|添加|删除|创建|对比|追踪|打开|复查|核对|确认|调整|排查|定位|分析|处理|清理|同步|合并|重构|优化|补充|完善)/i;
function progressTitle(prose) {
  return [...plain(prose).replace(actionPrefix, '').split(/[。！？!?]|\.(?:\s|$)/)[0].trim()].slice(0, 60).join('');
}
function verificationOf(prose) {
  const text = prose.trim();
  if ([...text].length > 200 || /[\n]|(?:^|\s)[#*-]\s|summary|overall|recap|总结|全部|所有/i.test(text)
    || /\b(?:will|shall|going to|not|never|without|but|however|and|or|may|might|should|would|could|if)\b|未(?:验证|测试|检查|运行|完成|通过|成功)|没有|尚未|不能|无法|不会|不(?:确定|清楚|一致|通过|成功)|将|计划|准备|接下来|但是|但|不过|可能|如果/i.test(text)
    || !/\b(?:tests?|checks?|build|lint|typecheck|verification)\b|验证|检查|测试|构建/i.test(text)) return undefined;
  const matches = [
    ['passed', /\b(?:passed|passes|successful|succeeded)\b|通过|成功/i],
    ['failed', /\b(?:failed|fails|failure)\b|失败/i],
    ['skipped', /\bskipped\b|跳过/i],
  ].filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? { status: matches[0][0], evidence: text, source: 'assistant' } : undefined;
}
function enrich(state, task, prose) {
  const group = state.stepStates.get(task);
  const verification = verificationOf(prose);
  // Broad recaps do not become evidence or displace the action explanation.
  if ([...prose].length <= 240 && prose.split(/[。！？!?]|\.(?:\s|$)/).filter(x => x.trim()).length <= 2
    && !/^[#*•-]\s|\n|summary|overall|recap|总结|全部|所有/i.test(prose)) {
    group.notes = [prose, ...group.notes.filter(note => note !== prose)].slice(0, 3);
    task.summary = group.notes.join('\n\n');
  }
  if (verification) task.verification = verification;
}
function progress(state, value) {
  const prose = clean(value, 500).trim();
  // Native item_completed may repeat the response_item assistant message.
  if (!prose || prose === state.prose) return;
  const title = progressTitle(prose);
  const newAction = actionPrefix.test(plain(prose)) && actionVerb.test(title);
  if (state.currentStep && newAction && title.toLowerCase() !== state.currentStep.subject.toLowerCase()) {
    state.currentStep = undefined;
  } else if (state.currentStep) enrich(state, state.currentStep, prose);
  state.prose = prose;
}
function operationStatus(task, id, status) {
  const operation = task.operations.find(operation => operation.id === id);
  if (operation) operation.status = status;
}

function outputFailed(output) {
  const value = object(output);
  if (value.isError === true || value.is_error === true || value.error || value.success === false) return true;
  if (number(value.exit_code) !== undefined) return value.exit_code !== 0;
  if (typeof value.exit_code === 'number') return value.exit_code !== 0;
  if (typeof output !== 'string') return false;
  try { return outputFailed(JSON.parse(output)); } catch { /* Text tool output. */ }
  return /(?:Process exited with code|Exit code:)\s*-?[1-9]\d*\b/i.test(output)
    || /^(?:Error:|error:|apply_patch verification failed)/m.test(output);
}

export function createSession() {
  return {
    id: '', parentId: undefined, name: '主代理', project: '', source: '', version: '',
    model: '', status: 'idle', recent: '等待活动', calls: 0, tasks: [], plan: [],
    tokens: undefined, contextTokens: undefined, contextWindow: undefined,
    startedAt: undefined, endedAt: undefined, updatedAt: 0, turnId: '',
    pending: new Map(), callTasks: new Map(), planRevision: 0, appliedPlanRevision: 0, pendingPlans: new Map(), seenCalls: new Set(), prose: '', turnOpen: false,
    currentStep: undefined, stepStates: new WeakMap(),
  };
}

function beginTurn(state, id, at) {
  if (id && state.turnId === id) return;
  // A legacy user_message and task_started may both describe the same turn.
  if (!id && state.turnOpen) return;
  state.turnId = id || '';
  state.turnOpen = true;
  state.status = 'running';
  state.startedAt = at;
  state.endedAt = undefined;
  state.tasks = []; state.plan = []; state.pending.clear(); state.pendingPlans.clear(); state.seenCalls.clear();
  state.callTasks.clear(); state.planRevision = 0; state.appliedPlanRevision = 0;
  state.prose = ''; state.currentStep = undefined; state.stepStates = new WeakMap();
  state.recent = '正在处理当前任务';
}

function endTurn(state, status, at) {
  state.status = status; state.endedAt = at; state.turnOpen = false;
  state.recent = { completed: '本轮已完成', failed: '本轮失败', killed: '本轮已停止' }[status];
  // A missing result is never evidence that a tool succeeded.
  for (const task of new Set(state.pending.values())) {
    if (task.status !== 'failed') task.status = status === 'completed' ? 'unknown' : status;
    for (const operation of task.operations) if (operation.status === 'in_progress') operation.status = status === 'completed' ? 'unknown' : status;
  }
  state.pending.clear();
  state.pendingPlans.clear();
}

export function applyRecord(state, raw) {
  const row = object(raw), p = object(row.payload);
  const at = timestamp(row.timestamp) ?? state.updatedAt;
  state.updatedAt = Math.max(state.updatedAt, at);
  if (row.type === 'session_meta') {
    state.id = clean(p.id || p.session_id, 128);
    state.project = clean(p.cwd, 2048); state.version = clean(p.cli_version);
    const source = object(p.source), spawn = object(object(source.subagent).thread_spawn);
    state.parentId = clean(spawn.parent_thread_id, 128) || undefined;
    state.name = clean(spawn.agent_nickname || spawn.agent_path) || (state.parentId ? '子代理' : '主代理');
    state.source = typeof p.source === 'string' ? clean(p.source) : state.parentId ? 'subagent' : 'unknown';
    state.contextWindow = number(p.context_window);
    return;
  }
  if (row.type === 'turn_context') {
    state.model = clean(p.model) || state.model;
    return;
  }
  if (row.type === 'token_usage_record') {
    state.tokens = number(object(p.thread_token_usage).total_tokens) ?? state.tokens;
    return;
  }
  if (row.type === 'event_msg') {
    if (p.type === 'task_started') beginTurn(state, clean(p.turn_id, 128), timestamp(p.started_at) ?? at);
    if (p.type === 'user_message') beginTurn(state, '', at);
    if (p.turn_id && state.turnId && clean(p.turn_id, 128) !== state.turnId) return;
    if (p.type === 'task_complete' || p.type === 'task_completed') endTurn(state, 'completed', at);
    if (p.type === 'turn_aborted') endTurn(state, 'killed', at);
    if (p.type === 'error' || p.type === 'task_failed') endTurn(state, 'failed', at);
    if (p.type === 'agent_message') progress(state, p.message);
    if (p.type === 'token_count') {
      const info = object(p.info);
      state.tokens = number(object(info.total_token_usage).total_tokens) ?? state.tokens;
      state.contextTokens = number(object(info.last_token_usage).input_tokens) ?? state.contextTokens;
      state.contextWindow = number(info.model_context_window) ?? state.contextWindow;
    }
    // Native persisted items can repeat response_item tool calls; only enrich
    // failure status here, rather than counting a second operation.
    if (p.type === 'item_completed') {
      const item = object(p.item);
      if (/^(AgentMessage|agentMessage)$/.test(item.type)) {
        progress(state, item.text || (Array.isArray(item.content)
          ? item.content.map(c => clean(c.text, 500)).join(' ') : ''));
      }
      if (item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)) {
        const task = state.pending.get(item.call_id || item.id) || state.callTasks.get(item.call_id || item.id) || state.tasks.find(t => t.id === item.id);
        if (task) {
          task.status = 'failed';
          operationStatus(task, item.call_id || item.id, 'failed');
          const group = state.stepStates.get(task); if (group) group.failed = true;
        }
      }
    }
    return;
  }
  if (row.type !== 'response_item') return;
  if (p.type === 'message' && p.role === 'assistant') {
    progress(state, (Array.isArray(p.content) ? p.content : []).map(c => clean(c.text, 500)).join(' '));
  }
  // User response_items include injected context and forked history; task_started
  // is the turn boundary. Never clear the flow merely because role === user.
  if (p.type === 'function_call' || p.type === 'custom_tool_call') {
    const id = clean(p.call_id || p.id, 160);
    if (!id || state.seenCalls.has(id)) return;
    state.seenCalls.add(id);
    // Bound deduplication memory even for extremely long turns.
    if (state.seenCalls.size > 2000) state.seenCalls.delete(state.seenCalls.values().next().value);
    const args = argsOf(p), name = toolName(p.name);
    if (name === 'update_plan' && Array.isArray(args.plan)) {
      state.pendingPlans.set(id, { revision: ++state.planRevision, steps: args.plan.slice(0, 60).map(step => ({
        subject: clean(object(step).step, 300),
        status: ['pending', 'in_progress', 'completed'].includes(object(step).status) ? step.status : 'pending',
      })).filter(step => step.subject) });
    }
    const category = categories[name];
    let task = state.currentStep;
    // Without prose, only a known, unchanged category justifies grouping calls.
    if (task && ((!state.prose && (!category || state.stepStates.get(task).category !== category))
      || (task.kind === 'plan') !== (name === 'update_plan'))) task = undefined;
    if (!task) {
      // A plan never reuses stale outcome prose as its subject or summary.
      const isPlan = name === 'update_plan';
      const subject = isPlan ? '' : progressTitle(state.prose);
      task = { id, kind: isPlan ? 'plan' : 'stage',
        subject: subject || titles[name] || '执行工具操作', titleGenerated: !subject,
        tool: name, summary: isPlan ? '' : state.prose, status: 'in_progress', startedAt: at,
        operations: [], operationCount: 0, verification: { status: 'unknown' } };
      state.stepStates.set(task, { pending: 0, failed: false, unknown: false, category, notes: !isPlan && state.prose ? [state.prose] : [] });
      state.tasks.push(task); state.tasks = state.tasks.slice(-30);
      state.currentStep = task;
    }
    task.operationCount++;
    if (task.operations.length < 40) task.operations.push({ id, title: titles[name] || '执行工具操作', status: 'in_progress' });
    const group = state.stepStates.get(task);
    group.pending++; task.endedAt = undefined;
    task.status = group.failed ? 'failed' : 'in_progress';
    state.calls++; state.recent = task.subject;
    state.pending.set(id, task);
    state.callTasks.set(id, task);
    if (state.callTasks.size > 2000) state.callTasks.delete(state.callTasks.keys().next().value);
    if (state.pending.size > 500) {
      const oldest = state.pending.keys().next().value;
      const evicted = state.pending.get(oldest), evictedGroup = state.stepStates.get(evicted);
      evictedGroup.pending--; evictedGroup.unknown = true;
      operationStatus(evicted, oldest, 'unknown');
      if (!evictedGroup.pending && !evictedGroup.failed) evicted.status = 'unknown';
      state.pending.delete(oldest); state.pendingPlans.delete(oldest);
    }
  }
  if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
    const id = clean(p.call_id, 160), task = state.pending.get(id);
    if (!task) return;
    const failed = outputFailed(p.output), group = state.stepStates.get(task);
    group.pending--; group.failed ||= failed;
    operationStatus(task, id, failed ? 'failed' : 'completed');
    task.status = group.failed ? 'failed' : group.pending ? 'in_progress' : group.unknown ? 'unknown' : 'completed';
    const plan = state.pendingPlans.get(id);
    if (!failed && plan && plan.revision > state.appliedPlanRevision) {
      state.plan = plan.steps; state.appliedPlanRevision = plan.revision;
    }
    state.pendingPlans.delete(id);
    if (!group.pending) task.endedAt = at;
    state.pending.delete(id);
    state.recent = state.pending.size ? [...state.pending.values()].at(-1).subject : '正在处理当前任务';
  }
}

export function snapshot(state) {
  const { pending, callTasks, planRevision, appliedPlanRevision, pendingPlans, seenCalls, prose, turnOpen, currentStep, stepStates, ...view } = state;
  return { ...view, tasks: view.tasks.map(t => ({ ...t, operations: t.operations.map(operation => ({ ...operation })), verification: { ...t.verification } })), plan: view.plan.map(t => ({ ...t })) };
}
