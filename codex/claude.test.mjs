// Exercise the real host-independent Claude parser without requiring Claude's
// proprietary runtime. Built-in type stripping keeps the test dependency-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = async file => stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'));
const connectorUrl = moduleUrl(await source('../hooks/connector.ts'));
const modelUrl = moduleUrl((await source('../hooks/model.ts')).replace("'./connector'", JSON.stringify(connectorUrl)));
const model = await import(modelUrl);
const stepsUrl = moduleUrl((await source('../hooks/steps.ts')).replace("'./model'", JSON.stringify(modelUrl)));
const { conversationSteps } = await import(stepsUrl);
const hostUrl = moduleUrl(`
  export const atom = (_id, value) => value;
  export async function update($, _atom, fn) {
    if ($.broken) throw new Error('Panel storage failed');
    $.state = fn($.state);
  }
`);
const paneUrl = moduleUrl('export async function drawPanel() {}');
const registerUrl = moduleUrl((await source('../hooks/register.tsx'))
  .replace("'claude-code'", JSON.stringify(hostUrl))
  .replace("'./model'", JSON.stringify(modelUrl))
  .replace("'./pane'", JSON.stringify(paneUrl))
  .replace("'./steps'", JSON.stringify(stepsUrl)));
const { register } = await import(registerUrl);
function host() {
  return {
    state: { ...model.initial, sessionId: 'session', members: [], tasks: [] }, listCalls: 0,
    agent: { list: async () => [] },
    session: { id: async () => 'session', messages: async () => [], cwd: async () => '/project', model: async () => 'model', usage: async () => ({ context: { tokens: 0 } }) },
    command: { register: async () => {} }, clock: { every: () => {} }, ui: { open: async () => ({ isPlaced: true }) },
  };
}
function hooks() {
  const handlers = new Map(); register((event, ...args) => handlers.set(event, args.at(-1))); return handlers;
}
const user = text => ({ role: 'user', text });
const assistant = (text, toolUses = []) => ({ role: 'assistant', text, toolUses });
const use = (done = false, isError = false) => ({ tool: 'Read', input: { file_path: '/project/file.ts' }, ...(done ? { text: 'ok' } : {}), isError });

test('Claude grouping never completes while an earlier parallel tool is pending', () => {
  const steps = conversationSteps([user('work'), assistant('读取相关文件'), assistant('', [use()]), assistant('', [use(true)])]);
  assert.equal(steps.length, 1); assert.equal(steps[0].status, 'in_progress');
  assert.equal(conversationSteps([user('work'), assistant('读取文件', [use(true)]), assistant('', [use(true)])])[0].status, 'completed');
});
test('Claude tool results retain steps and the next request clears them', () => {
  const messages = [user('work'), assistant('读取文件', [use(true)]), { role: 'user', text: 'output', toolResults: [{}] }];
  assert.equal(conversationSteps(messages).length, 1);
  assert.equal(conversationSteps([...messages, user('next request')]).length, 0);
});
test('Claude preserves failures and extracts plan body', () => {
  assert.equal(conversationSteps([assistant('', [use(true, true)]), assistant('', [use(true)])])[0].status, 'failed');
  const plan = conversationSteps([assistant('', [{ tool: 'ExitPlanMode', input: { plan: 'Review, build, verify' }, text: 'ok' }])]);
  assert.equal(plan[0].subject, '工作计划 · Plan'); assert.equal(plan[0].summary, 'Review, build, verify');
});
test('Claude tree handles cycles, orphans and SVG injection', () => {
  const members = model.mergeMembers([], [
    { id: 'a', parentId: 'b', name: '<script>', description: 'A & B', type: 'Explore', status: 'running' },
    { id: 'b', parentId: 'a', description: 'Cycle', type: 'Explore', status: 'idle' },
    { id: 'c', parentId: 'missing', description: 'Orphan', type: 'Explore', status: 'completed' },
  ], 100);
  assert.equal(model.treeRows(members).length, 3);
  assert.equal(model.diagram({ ...model.initial, members }).includes('<script>'), false);
  assert.equal(model.mergeMembers(members, [], 200).length, 3);
});

test('Claude concurrent sessions refresh independently', async () => {
  const handlers = hooks(), a = host(), b = host();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  a.agent.list = async () => { a.listCalls++; entered(); await new Promise(resolve => { release = resolve; }); return []; };
  b.agent.list = async () => { b.listCalls++; return []; };
  const first = handlers.get('turn.start')(a, {}, () => 'a');
  await started;
  assert.equal(await handlers.get('turn.start')(b, {}, () => 'b'), 'b');
  assert.equal(b.listCalls, 1); release(); assert.equal(await first, 'a');
});
test('Claude lifecycle observations cannot replace execution results', async () => {
  const handlers = hooks(), engine = host(); engine.broken = true;
  for (const event of ['session.start', 'turn.start', 'turn.complete', 'agent.spawn']) {
    let called = 0;
    const result = await handlers.get(event)(engine, { cwd: '/project', durationMs: 10 }, () => { called++; return { agentId: 'child', result: 42 }; });
    assert.equal(called, 1); assert.equal(result.result, 42);
  }
  const original = new Error('Original tool failure');
  await assert.rejects(handlers.get('tool.call')(engine, { tool: 'Bash' }, () => { throw original; }), error => error === original);
});
test('Claude failed turns retain accurate status text', async () => {
  const engine = host();
  await hooks().get('turn.complete')(engine, { reason: 'error', durationMs: 10 }, () => 'done');
  assert.equal(engine.state.mainStatus, 'failed'); assert.equal(engine.state.mainRecent, '执行失败');
});

test('Claude overlapping tools keep the remaining activity visible even with identical labels', async () => {
  const engine = host(), handler = hooks().get('tool.call');
  let completeFirst, completeSecond;
  const first = handler(engine, { tool: 'Read', description: '读取相关文件' }, () => new Promise(resolve => { completeFirst = resolve; }));
  const second = handler(engine, { tool: 'Read', description: '读取相关文件' }, () => new Promise(resolve => { completeSecond = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  completeFirst('first'); await first;
  assert.equal(engine.state.mainTool, '读取相关文件');
  completeSecond('second'); await second;
  assert.equal(engine.state.mainTool, undefined); assert.equal(engine.state.mainCalls, 2);
});

test('Claude activity returns to the earlier tool when the later call finishes first', async () => {
  const engine = host(), handler = hooks().get('tool.call');
  engine.state.members = [{ id: 'child', calls: 0 }];
  let completeFirst, completeSecond;
  const first = handler(engine, { tool: 'Read', agentId: 'child', description: '读取源码' }, () => new Promise(resolve => { completeFirst = resolve; }));
  const second = handler(engine, { tool: 'Bash', agentId: 'child', description: '执行测试' }, () => new Promise(resolve => { completeSecond = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  completeSecond('second'); await second;
  assert.equal(engine.state.members[0].tool, '读取源码');
  completeFirst('first'); await first;
  assert.equal(engine.state.members[0].tool, undefined); assert.equal(engine.state.members[0].calls, 2);
});


test('Claude session identity changes reset data but same-session reload preserves it', async () => {
  const engine = host(), handlers = hooks();
  engine.state.mainCalls = 7;
  await handlers.get('session.start')(engine, { cwd: '/project' }, () => {});
  assert.equal(engine.state.mainCalls, 7);
  engine.session.id = async () => 'new-session';
  engine.state.members = [{ id: 'old-agent', calls: 2 }];
  await handlers.get('session.start')(engine, { cwd: '/project' }, () => {});
  assert.equal(engine.state.sessionId, 'new-session');
  assert.equal(engine.state.mainCalls, undefined);
  assert.deepEqual(engine.state.members, []);
});

test('Claude old tool completion cannot overwrite a replacement session', async () => {
  const engine = host(), handlers = hooks();
  let release;
  const old = handlers.get('tool.call')(engine, { tool: 'Read' }, () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  engine.session.id = async () => 'new-session';
  await handlers.get('session.start')(engine, { cwd: '/project' }, () => {});
  engine.state.mainTool = 'New session activity';
  release('done'); await old;
  assert.equal(engine.state.mainTool, 'New session activity');
});
