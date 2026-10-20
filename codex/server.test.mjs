import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPanelServer, parseOptions } from './server.mjs';

async function fixture(t, refresh = async () => ({ sessions: [], warnings: [], project: '/project' }), options) {
  const server = createPanelServer({ refresh }, options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('serves a usable panel and project snapshot with strict browser headers', async t => {
  const url = await fixture(t);
  const response = await fetch(url);
  assert.equal(response.status, 200); assert.match(await response.text(), /id="agents"/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const snapshot = await (await fetch(url + '/api/sessions')).json();
  assert.deepEqual(snapshot.sessions, []); assert.equal('project' in snapshot, false);
  for (const asset of ['/app.js', '/style.css']) assert.equal((await fetch(url + asset)).status, 200);
});
test('rejects external origins, rebinding hosts, cross-site fetches and mutations', async t => {
  const url = await fixture(t);
  for (const headers of [{ Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(url + '/api/sessions', { headers })).status, 403);
  }
  const status = await new Promise((resolve, reject) => {
    http.get(url + '/api/sessions', { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await fetch(url + '/api/sessions', { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + '/.codex/config.toml')).status, 404);
  assert.equal((await fetch(url + '/api/file?path=C:/private')).status, 404);
});
test('failures return a recoverable error without leaking paths or exception text', async t => {
  const url = await fixture(t, async () => { throw new Error('PRIVATE PATH'); });
  const response = await fetch(url + '/api/sessions');
  assert.equal(response.status, 500); assert.equal((await response.text()).includes('PRIVATE'), false);
});
test('CLI validates flags and supports CODEX_HOME without changing configuration', () => {
  assert.equal(parseOptions([], { CODEX_HOME: '/custom' }).port, 4317);
  assert.equal(parseOptions(['--port', '4318']).port, 4318);
  assert.equal(parseOptions([], { CODEX_THREAD_ID: 'current-thread' }).threadId, 'current-thread');
  assert.equal(parseOptions(['--thread', 'chosen'], { CODEX_THREAD_ID: 'current-thread' }).threadId, 'chosen');
  assert.throws(() => parseOptions(['--thread', '../private']));
  for (const args of [['--port', '0'], ['--port', 'no'], ['--host', '0.0.0.0'], ['--cwd']]) assert.throws(() => parseOptions(args));
  assert.deepEqual(parseOptions(['--help']), { help: true });
});

test('conversation API returns only the selected thread and descendants', async t => {
  const sessions = [
    { id: 'root-a' }, { id: 'root-b' }, { id: 'child-a', parentId: 'root-a' },
    { id: 'grandchild-a', parentId: 'child-a' }, { id: 'child-b', parentId: 'root-b' },
  ];
  const url = await fixture(t, async () => ({ sessions, warnings: [], project: '/project', updatedAt: 1 }));
  const view = await (await fetch(url + '/api/sessions?thread=root-a')).json();
  assert.equal(view.threadId, 'root-a');
  assert.deepEqual(view.sessions.map(s => s.id), ['root-a', 'child-a', 'grandchild-a']);
  const childView = await (await fetch(url + '/api/sessions?thread=child-a')).json();
  assert.deepEqual(childView.sessions.map(s => s.id), ['child-a', 'grandchild-a']);
  assert.equal((await fetch(url + '/api/sessions?thread=../private')).status, 400);
});

test('conversation warnings include only global issues and the selected thread subtree', async t => {
  const url = await fixture(t, async () => ({
    sessions: [{ id: 'root-a' }, { id: 'child-a', parentId: 'root-a' }, { id: 'root-b' }],
    warnings: ['global issue'],
    sessionWarnings: [
      { sessionId: 'root-a', message: 'root-a issue' },
      { sessionId: 'child-a', message: 'child-a issue' },
      { sessionId: 'root-b', message: 'root-b issue' },
    ],
  }));
  for (const [thread, expected] of [
    ['root-a', ['global issue', 'root-a issue', 'child-a issue']],
    ['child-a', ['global issue', 'child-a issue']],
    ['root-b', ['global issue', 'root-b issue']],
    ['missing', ['global issue']],
  ]) {
    const response = await fetch(url + '/api/sessions?thread=' + thread);
    assert.equal(response.status, 200);
    const view = await response.json();
    assert.deepEqual(view.warnings, expected);
    assert.equal('sessionWarnings' in view, false);
  }
});

test('the default panel stays bound when newer conversations arrive or the original disappears', async t => {
  let sessions = [{ id: 'original' }, { id: 'other' }];
  const url = await fixture(t, async () => ({ sessions, warnings: [] }));
  const load = async () => (await fetch(url + '/api/sessions')).json();
  assert.equal((await load()).threadId, 'original');
  sessions = [{ id: 'newer' }, { id: 'original' }, { id: 'other' }];
  assert.deepEqual((await load()).sessions.map(s => s.id), ['original']);
  sessions = [{ id: 'newer' }, { id: 'other' }];
  const missing = await load();
  assert.equal(missing.threadId, 'original'); assert.deepEqual(missing.sessions, []);
});

test('an explicitly bound server never picks another conversation while waiting for its records', async t => {
  const url = await fixture(t, async () => ({ sessions: [{ id: 'other' }], warnings: [] }), { threadId: 'expected' });
  const view = await (await fetch(url + '/api/sessions')).json();
  assert.equal(view.threadId, 'expected'); assert.deepEqual(view.sessions, []);
});
