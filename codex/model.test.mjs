import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRecord, createSession, snapshot } from './model.mjs';

const row = (type, payload, second = 0) => ({ type, payload, timestamp: `2026-10-20T00:00:${String(second).padStart(2, '0')}Z` });
const event = (state, type, extra = {}, second = 0) => applyRecord(state, row('event_msg', { type, ...extra }, second));
const call = (state, id, name, args = {}) => applyRecord(state, row('response_item', { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }));
const output = (state, id, result) => applyRecord(state, row('response_item', { type: 'function_call_output', call_id: id, output: result }));

test('real Codex metadata maps subagents and ignores private instructions', () => {
  const state = createSession();
  applyRecord(state, row('session_meta', { id: 'child', cwd: '/project', cli_version: '0.162.1',
    source: { subagent: { thread_spawn: { parent_thread_id: 'root', agent_nickname: 'Review' } } }, base_instructions: 'PRIVATE' }));
  assert.equal(state.parentId, 'root'); assert.equal(state.name, 'Review');
  assert.equal(JSON.stringify(snapshot(state)).includes('PRIVATE'), false);
});

test('parallel tool results retain independent states and failures', () => {
  const state = createSession(); event(state, 'task_started', { turn_id: 't1' });
  call(state, 'a', 'exec_command'); call(state, 'b', 'apply_patch');
  output(state, 'b', 'Success. Updated files.');
  assert.deepEqual(state.tasks.map(t => t.status), ['in_progress', 'completed']);
  output(state, 'a', { exit_code: 2 });
  assert.deepEqual(state.tasks.map(t => t.status), ['failed', 'completed']);
  call(state, 'a', 'exec_command'); assert.equal(state.calls, 2);
});

test('turn boundaries clear tasks and plan, not cumulative tokens or calls', () => {
  const state = createSession(); event(state, 'task_started', { turn_id: 't1' });
  call(state, 'plan', 'update_plan', { plan: [{ step: 'Build', status: 'in_progress' }] });
  event(state, 'token_count', { info: { total_token_usage: { total_tokens: 200 },
    last_token_usage: { input_tokens: 100, total_tokens: 120 }, model_context_window: 1000 } });
  applyRecord(state, row('response_item', { type: 'message', role: 'user', content: [{ text: 'injected context' }] }));
  assert.equal(state.tasks.length, 1);
  event(state, 'task_started', { turn_id: 't1' }); assert.equal(state.tasks.length, 1);
  event(state, 'task_complete', {}, 5); assert.equal(state.tasks[0].status, 'unknown');
  event(state, 'task_started', { turn_id: 't2' }, 6);
  assert.equal(state.tasks.length, 0); assert.equal(state.plan.length, 0);
  assert.equal(state.tokens, 200); assert.equal(state.contextTokens, 100); assert.equal(state.calls, 1);
});

test('custom tool errors, stopped turns and native duplicate records', () => {
  const state = createSession(); event(state, 'task_started', { turn_id: 't' });
  applyRecord(state, row('response_item', { type: 'custom_tool_call', call_id: 'a', name: 'apply_patch', input: 'PRIVATE DIFF' }));
  applyRecord(state, row('response_item', { type: 'custom_tool_call_output', call_id: 'a', output: 'apply_patch verification failed: bad patch' }));
  assert.equal(state.tasks[0].status, 'failed');
  event(state, 'item_completed', { item: { type: 'FileChange', id: 'a', status: 'completed' } });
  assert.equal(state.calls, 1); assert.equal(state.tasks[0].status, 'failed');
  call(state, 'b', 'exec_command'); event(state, 'turn_aborted', {}, 3);
  assert.equal(state.status, 'killed'); assert.equal(state.tasks[1].status, 'killed');
  assert.equal(JSON.stringify(snapshot(state)).includes('PRIVATE'), false);
});

test('unknown events and malformed optional fields do not break observations', () => {
  const state = createSession();
  for (const value of [null, [], {}, { type: 'future', payload: {} }, row('token_usage_record', { thread_token_usage: { total_tokens: -1 } })]) applyRecord(state, value);
  assert.equal(state.tokens, undefined);
  applyRecord(state, row('response_item', { type: 'function_call', call_id: 'a', name: 'update_plan', arguments: '{broken' }));
  assert.equal(state.tasks.length, 1);
});

test('retains only thirty recent steps without losing pending result correlation', () => {
  const state = createSession();
  for (let i = 0; i < 40; i++) call(state, String(i), 'exec_command');
  output(state, '39', { isError: true });
  assert.equal(state.tasks.length, 30); assert.equal(state.tasks.at(-1).status, 'failed');
  output(state, '0', 'done'); assert.equal(state.tasks.length, 30);
});

test('plans become authoritative only after successful tool results', () => {
  const state = createSession();
  call(state, 'plan-1', 'update_plan', { plan: [{ step: 'Build', status: 'pending' }] });
  assert.equal(state.plan.length, 0);
  output(state, 'plan-1', 'Plan updated'); assert.equal(state.plan[0].subject, 'Build');
  call(state, 'plan-2', 'update_plan', { plan: [{ step: 'Invalid replacement', status: 'completed' }] });
  output(state, 'plan-2', { isError: true }); assert.equal(state.plan[0].subject, 'Build');
});

test('progress text groups wrapper calls and completes only after every result arrives', () => {
  const state = createSession(); event(state, 'task_started', { turn_id: 't' });
  applyRecord(state, row('response_item', { type: 'message', role: 'assistant', content: [{ text: '我会检查任务流的标题和摘要。随后验证并行结果。' }] }));
  call(state, 'a', 'functions.exec'); call(state, 'b', 'mcp__cua_repl__js');
  assert.equal(state.tasks.length, 1); assert.equal(state.calls, 2);
  assert.equal(state.tasks[0].subject, '检查任务流的标题和摘要');
  assert.equal(state.tasks[0].summary, '我会检查任务流的标题和摘要。随后验证并行结果。');
  output(state, 'b', 'done'); assert.equal(state.tasks[0].status, 'in_progress');
  output(state, 'a', 'done'); assert.equal(state.tasks[0].status, 'completed');
  call(state, 'c', 'functions.exec'); assert.equal(state.tasks[0].status, 'in_progress');
  assert.equal(state.tasks.length, 1);
});

test('new progress starts another step while failed grouped results remain failed', () => {
  const state = createSession(); event(state, 'agent_message', { message: '检查错误处理。' });
  call(state, 'a', 'exec'); call(state, 'b', 'js');
  output(state, 'a', { isError: true }); output(state, 'b', 'done');
  assert.equal(state.tasks[0].status, 'failed');
  event(state, 'agent_message', { message: '运行修复后的测试。' });
  call(state, 'c', 'exec'); output(state, 'c', 'done');
  assert.deepEqual(state.tasks.map(t => t.status), ['failed', 'completed']);
  assert.equal(state.tasks[1].subject, '运行修复后的测试');
});

test('duplicate native messages and empty text do not consume or split the progress summary', () => {
  const state = createSession(); event(state, 'agent_message', { message: '检查显示效果。' });
  call(state, 'a', 'exec');
  event(state, 'item_completed', { item: { type: 'AgentMessage', content: [{ text: '检查显示效果。' }] } });
  applyRecord(state, row('response_item', { type: 'message', role: 'assistant', content: [] }));
  call(state, 'b', 'js');
  assert.equal(state.tasks.length, 1); assert.equal(state.tasks[0].summary, '检查显示效果。');
  event(state, 'task_started', { turn_id: 'next' }); call(state, 'c', 'exec');
  assert.equal(state.tasks[0].summary, ''); assert.equal(state.tasks[0].subject, '执行工具操作');
});

test('custom JSON tool input supplies a human title without retaining source code', () => {
  const state = createSession();
  applyRecord(state, row('response_item', { type: 'custom_tool_call', call_id: 'a', name: 'js',
    input: JSON.stringify({ title: '检查任务面板', code: 'PRIVATE SCRIPT' }) }));
  assert.equal(state.tasks[0].subject, '检查任务面板');
  assert.equal(JSON.stringify(snapshot(state)).includes('PRIVATE SCRIPT'), false);
  call(state, 'b', 'exec'); call(state, 'c', 'js');
  assert.deepEqual(state.tasks.slice(1).map(t => t.subject), ['执行工具操作', '执行页面操作']);
});


test('late terminal events cannot finish a different active turn', () => {
  const state = createSession(); event(state, 'task_started', { turn_id: 'old' });
  event(state, 'task_started', { turn_id: 'new' }); call(state, 'a', 'exec');
  event(state, 'task_complete', { turn_id: 'old' });
  assert.equal(state.status, 'running'); assert.equal(state.pending.size, 1);
});

test('out-of-order plan acknowledgments preserve the newest successful revision', () => {
  const state = createSession();
  call(state, 'old', 'update_plan', { plan: [{ step: 'Old', status: 'pending' }] });
  call(state, 'new', 'update_plan', { plan: [{ step: 'New', status: 'completed' }] });
  output(state, 'new', 'ok'); output(state, 'old', 'ok');
  assert.equal(state.plan[0].subject, 'New');
});

test('native failure after grouped output still marks the group failed', () => {
  const state = createSession(); event(state, 'agent_message', { message: 'Inspect files' });
  call(state, 'a', 'exec'); call(state, 'b', 'exec');
  output(state, 'a', 'ok'); output(state, 'b', 'ok');
  event(state, 'item_completed', { item: { id: 'b', status: 'failed' } });
  assert.equal(state.tasks[0].status, 'failed');
});
