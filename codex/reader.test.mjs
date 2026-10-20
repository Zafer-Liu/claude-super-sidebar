import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { RolloutReader, SessionStore } from './reader.mjs';

const line = (type, payload) => JSON.stringify({ timestamp: '2026-10-20T00:00:00Z', type, payload }) + '\n';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'team-panel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('incrementally reads split UTF-8, incomplete lines, malformed lines and truncation', async t => {
  const root = await fixture(t), file = path.join(root, 'rollout-test.jsonl');
  const meta = line('session_meta', { id: 'one', cwd: root });
  const tool = Buffer.from(line('response_item', { type: 'function_call', call_id: 'a', name: 'exec_command', arguments: JSON.stringify({ description: '读取文件' }) }));
  const split = tool.indexOf(Buffer.from('读')) + 1;
  await writeFile(file, Buffer.concat([Buffer.from(meta), tool.subarray(0, split)]));
  const reader = new RolloutReader(file); let view = await reader.read();
  assert.equal(view.tasks.length, 0);
  await appendFile(file, tool.subarray(split)); view = await reader.read();
  assert.equal(view.tasks[0].subject, '读取文件'); assert.equal(view.calls, 1);
  await reader.read(); assert.equal(reader.state.calls, 1);
  await appendFile(file, '{bad json}\n' + line('response_item', { type: 'function_call_output', call_id: 'a', output: 'done' }));
  view = await reader.read(); assert.equal(view.tasks[0].status, 'completed'); assert.equal(reader.invalidLines, 1);
  await writeFile(file, line('session_meta', { id: 'two', cwd: root }));
  view = await reader.read(); assert.equal(view.id, 'two'); assert.equal(view.tasks.length, 0);
});

test('project scope includes children and excludes other projects and archived files', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions'), day = path.join(sessionsDir, '2026', '10', '20');
  await mkdir(day, { recursive: true });
  const cwd = path.join(root, 'project');
  await writeFile(path.join(day, 'rollout-root.jsonl'), line('session_meta', { id: 'root', cwd }));
  await writeFile(path.join(day, 'rollout-child.jsonl'), line('session_meta', { id: 'child', cwd,
    source: { subagent: { thread_spawn: { parent_thread_id: 'root' } } } }));
  await writeFile(path.join(day, 'rollout-other.jsonl'), line('session_meta', { id: 'other', cwd: path.join(root, 'other') }));
  await writeFile(path.join(day, 'unrelated.jsonl'), line('session_meta', { id: 'unrelated', cwd }));
  const store = new SessionStore({ sessionsDir, cwd });
  const [first, concurrent] = await Promise.all([store.refresh(), store.refresh()]);
  assert.deepEqual(first.sessions, concurrent.sessions); assert.deepEqual(first.sessions.map(s => s.id).sort(), ['child', 'root']);
  assert.equal(first.sessions.find(s => s.id === 'child').parentId, 'root');
});

test('an empty directory and a new session with a partially written header recover', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions');
  const store = new SessionStore({ sessionsDir, cwd: root });
  assert.deepEqual((await store.refresh()).sessions, []);
  await mkdir(sessionsDir);
  const file = path.join(sessionsDir, 'rollout-new.jsonl');
  const meta = line('session_meta', { id: 'new', cwd: root });
  await writeFile(file, meta.slice(0, -2)); store.lastScan = 0;
  assert.equal((await store.refresh()).sessions.length, 0);
  await appendFile(file, meta.slice(-2)); store.lastScan = 0;
  assert.equal((await store.refresh()).sessions[0].id, 'new');
});

test('does not follow symbolic links outside the session directory', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions');
  await mkdir(sessionsDir);
  const outside = path.join(root, 'outside.jsonl');
  await writeFile(outside, line('session_meta', { id: 'outside', cwd: root }));
  try { await symlink(outside, path.join(sessionsDir, 'rollout-link.jsonl')); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink permission unavailable'); throw error; }
  assert.deepEqual((await new SessionStore({ sessionsDir, cwd: root }).refresh()).sessions, []);
});

test('replacement logs are rechecked against the project boundary and can recover', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions');
  await mkdir(sessionsDir);
  const file = path.join(sessionsDir, 'rollout-replaced.jsonl');
  const original = line('session_meta', { id: 'original', cwd: root, cli_version: 'padding-to-make-this-file-larger' });
  await writeFile(file, original);
  const store = new SessionStore({ sessionsDir, cwd: root });
  assert.equal((await store.refresh()).sessions[0].id, 'original');
  await writeFile(file, line('session_meta', { id: 'replacement', cwd: '/other-project' }));
  const replaced = await store.refresh();
  assert.deepEqual(replaced.sessions, []); assert.equal(replaced.sessionWarnings.length, 1);
  assert.deepEqual((await store.refresh()).sessions, []);
  await writeFile(file, line('session_meta', { id: 'restored', cwd: root })); store.lastScan = 0;
  assert.equal((await store.refresh()).sessions[0].id, 'restored');
});


test('explicit concurrent threads bypass the unrelated discovery cap and isolate warnings', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions');
  await mkdir(sessionsDir);
  await writeFile(path.join(sessionsDir, 'rollout-a.jsonl'), line('session_meta', { id: 'a', cwd: root }) + '{bad}\n');
  await writeFile(path.join(sessionsDir, 'rollout-child.jsonl'), line('session_meta', { id: 'child', cwd: root,
    source: { subagent: { thread_spawn: { parent_thread_id: 'a' } } } }));
  await writeFile(path.join(sessionsDir, 'rollout-b.jsonl'), line('session_meta', { id: 'b', cwd: root }));
  const store = new SessionStore({ sessionsDir, cwd: root, maxSessions: 1 });
  const [a, b] = await Promise.all([store.refresh('a'), store.refresh('b')]);
  assert.deepEqual(a.sessions.map(s => s.id).sort(), ['a', 'child']);
  assert.deepEqual(b.sessions.map(s => s.id), ['b']);
  assert.equal(a.sessionWarnings[0].sessionId, 'a');
  assert.deepEqual(b.sessionWarnings, []);
});

test('same-inode larger rewrites reset identity and excluded metadata can recover', async t => {
  const root = await fixture(t), sessionsDir = path.join(root, 'sessions');
  await mkdir(sessionsDir);
  const file = path.join(sessionsDir, 'rollout-same.jsonl');
  await writeFile(file, line('session_meta', { id: 'a', cwd: root }));
  const store = new SessionStore({ sessionsDir, cwd: root });
  assert.equal((await store.refresh('a')).sessions[0].id, 'a');
  await writeFile(file, line('session_meta', { id: 'b', cwd: '/other', padding: 'x'.repeat(1000) }));
  assert.deepEqual((await store.refresh('a')).sessions, []);
  await writeFile(file, line('session_meta', { id: 'c', cwd: root })); store.lastScan = 0;
  assert.equal((await store.refresh('c')).sessions[0].id, 'c');
});
