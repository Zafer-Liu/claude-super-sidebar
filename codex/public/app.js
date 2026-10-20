/* No raw HTML or Markdown from session records is ever inserted into the DOM. */
const $ = id => document.getElementById(id);
const labels = { running: '运行中', in_progress: '进行中', completed: '已完成', failed: '失败',
  killed: '已停止', idle: '空闲', pending: '待开始', waiting: '等待中', unknown: '结果未观测' };
const label = status => labels[status] || '未知状态';
const format = n => typeof n === 'number' ? n.toLocaleString('zh-CN') : '暂无数据';
let selected = new URL(location.href).searchParams.get('thread') || '';
let sessions = [], refreshing = false, lastRender = '', generation = 0;
const expanded = new Map();
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function elapsed(session) {
  if (!session.startedAt) return '暂无数据';
  const end = session.endedAt || session.updatedAt;
  return `${Math.max(0, Math.floor((end - session.startedAt) / 1000))} 秒（已观测）`;
}
function agent(session, depth, parentName) {
  const wrap = element('div', 'branch');
  // Classes, not inline style, keep the strict CSP intact.
  if (depth) wrap.append(element('p', 'branch-label', `${parentName} → ${session.name}`));
  const details = element('details', 'agent'); details.dataset.status = session.status;
  details.dataset.id = session.id;
  details.open = expanded.get(session.id) ?? depth === 0;
  details.addEventListener('toggle', () => expanded.set(session.id, details.open));
  const summary = element('summary');
  summary.append(element('strong', '', `${session.name} · ${label(session.status)}`), element('span', 'recent', session.recent));
  const dl = element('dl');
  for (const [key, value] of [
    ['模型', session.model || '暂无数据'], ['模式', depth ? '子代理' : '主会话'],
    ['来源', session.source], ['Token 用量', `${format(session.tokens)}（会话累计）`],
    ['最近输入', `${format(session.contextTokens)} tokens`], ['上下文上限', `${format(session.contextWindow)} tokens`],
    ['本轮耗时', elapsed(session)], ['工具调用', `${session.calls} 次（会话累计）`],
    ['会话 ID', session.id],
  ]) dl.append(element('dt', '', key), element('dd', '', value));
  details.append(summary, dl); wrap.append(details); return wrap;
}
function render() {
  const focusedAgent = document.activeElement?.tagName === 'SUMMARY'
    ? document.activeElement.closest('details')?.dataset.id : undefined;
  const main = sessions.find(s => s.id === selected);
  const agents = $('agents'), flow = $('flow');
  agents.replaceChildren(); flow.replaceChildren(); $('plan').replaceChildren();
  if (!main) {
    agents.append(element('p', 'empty', selected ? '当前对话的记录暂不可用，将自动重试。' : '等待当前对话的 Codex 记录。'));
    $('counts').textContent = ''; $('progress').textContent = ''; $('flow-empty').hidden = false; return;
  }
  const seen = new Set(), rows = [];
  function walk(session, depth = 0, parent = '') {
    if (seen.has(session.id)) return;
    seen.add(session.id); rows.push(session); agents.append(agent(session, depth, parent));
    for (const child of sessions) if (child.parentId === session.id) walk(child, depth + 1, session.name);
  }
  walk(main);
  $('counts').textContent = `${rows.length} 成员 · ${rows.filter(s => s.status === 'running').length} 运行中`;
  $('progress').textContent = `${main.tasks.filter(t => t.status === 'completed').length}/${main.tasks.length}`;
  $('flow-empty').hidden = main.tasks.length > 0;
  for (const task of main.tasks) {
    const li = element('li', 'step'); li.dataset.status = task.status;
    const head = element('div', 'step-head');
    head.append(element('h3', '', task.subject), element('span', 'status', label(task.status)));
    li.append(head);
    if (task.summary && task.summary !== task.subject) li.append(element('p', '', task.summary));
    flow.append(li);
  }
  if (main.plan.length) {
    const plan = element('div', 'plan'), list = element('ul');
    plan.append(element('h3', '', '工作计划 · Plan'));
    for (const step of main.plan) list.append(element('li', '', `${label(step.status)} · ${step.subject}`));
    plan.append(list); $('plan').append(plan);
  }
  if (focusedAgent) {
    [...agents.querySelectorAll('details')].find(node => node.dataset.id === focusedAgent)?.querySelector('summary')?.focus({ preventScroll: true });
  }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true; $('refresh').disabled = true;
  const requestGeneration = ++generation;
  try {
    const endpoint = selected ? `/api/sessions?thread=${encodeURIComponent(selected)}` : '/api/sessions';
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('读取会话失败，请检查服务终端的提示后重试。');
    const data = await response.json();
    if (requestGeneration !== generation) return;
    sessions = data.sessions;
    if (!selected && data.threadId) {
      selected = data.threadId;
      const url = new URL(location.href); url.searchParams.set('thread', selected);
      history.replaceState(null, '', url);
    }
    $('notice').textContent = data.warnings.length ? data.warnings.join(' ') : `已同步 · ${new Date(data.updatedAt).toLocaleTimeString('zh-CN')}`;
    $('notice').classList.toggle('error', data.warnings.length > 0);
    // Preserve keyboard focus and expanded details when the data has not changed.
    const renderKey = JSON.stringify([selected, sessions]);
    if (renderKey !== lastRender) { render(); lastRender = renderKey; }
  } catch (error) {
    $('notice').textContent = `${error.name === 'TimeoutError' ? '读取超时' : error.message} 将自动重试，保留上次观测。`;
    $('notice').classList.add('error');
  } finally { refreshing = false; $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
async function poll() { await refresh(); window.setTimeout(poll, 2000); }
poll();
