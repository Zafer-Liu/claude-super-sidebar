import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SessionStore } from './reader.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

const validThreadId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);

// Return only the requested conversation and its descendants. Missing threads
// stay empty; they must never fall back to a different conversation.
export function conversationSnapshot(data, threadId) {
  const ids = new Set(data.sessions.some(s => s.id === threadId) ? [threadId] : []);
  let added = true;
  while (added) {
    added = false;
    for (const session of data.sessions) if (ids.has(session.parentId) && !ids.has(session.id)) {
      ids.add(session.id); added = true;
    }
  }
  const warnings = [...data.warnings,
    ...(data.sessionWarnings ?? []).filter(warning => ids.has(warning.sessionId)).map(warning => warning.message)];
  return { threadId, sessions: data.sessions.filter(s => ids.has(s.id)),
    warnings, updatedAt: data.updatedAt };
}

export function createPanelServer(store, { threadId = '' } = {}) {
  let defaultThreadId = threadId;
  return http.createServer(async (req, res) => {
    const port = res.socket.localPort;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const origins = new Set([...hosts].map(host => `http://${host}`));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    // Loopback alone is insufficient: check Host against DNS rebinding and
    // Origin / fetch metadata against pages probing localhost.
    if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))
      || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400); res.end('Bad request'); return; }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const pathname = url.pathname;
      if (pathname === '/api/sessions') {
        const requested = url.searchParams.get('thread');
        if (requested !== null && !validThreadId(requested)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '无效的对话标识。' })); return;
        }
        const data = await store.refresh(requested ?? defaultThreadId);
        if (requested === null && !defaultThreadId) {
          defaultThreadId = data.sessions.find(s => !s.parentId)?.id || data.sessions[0]?.id || '';
        }
        const view = conversationSnapshot(data, requested ?? defaultThreadId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(view)); return;
      }
      const asset = assets.get(pathname);
      if (!asset) { res.writeHead(404); res.end('Not found'); return; }
      const body = await readFile(path.join(publicDir, asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '读取会话失败，请检查 Codex 会话目录及读取权限。' }));
    }
  });
}

export function parseOptions(args, env = process.env) {
  const options = { port: 4317, cwd: process.cwd(), threadId: env.CODEX_THREAD_ID || '', codexHome: env.CODEX_HOME || path.join(os.homedir(), '.codex') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') return { help: true };
    const key = { '--port': 'port', '--cwd': 'cwd', '--codex-home': 'codexHome', '--thread': 'threadId' }[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`无效参数：${args[i]}`);
    options[key] = args[++i];
  }
  options.port = Number(options.port);
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('端口必须是 1–65535 的整数。');
  if (options.threadId && !validThreadId(options.threadId)) throw new Error('无效的对话标识。');
  options.cwd = path.resolve(options.cwd); options.codexHome = path.resolve(options.codexHome);
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Team Panel — Codex\nnode codex/server.mjs [--cwd PROJECT] [--thread ID] [--port 4317] [--codex-home DIR]\n每个面板固定观察一个对话；优先绑定 CODEX_THREAD_ID。'); return;
  }
  const store = new SessionStore({ sessionsDir: path.join(options.codexHome, 'sessions'), cwd: options.cwd });
  const server = createPanelServer(store, { threadId: options.threadId });
  server.on('error', error => { console.error(`启动失败：${error.code === 'EADDRINUSE' ? '端口已占用，请使用 --port 指定其他端口。' : error.message}`); process.exitCode = 1; });
  server.listen(options.port, '127.0.0.1', () => {
    const query = options.threadId ? `?thread=${encodeURIComponent(options.threadId)}` : '';
    console.log(`Team Panel · Codex: http://127.0.0.1:${options.port}/${query}\n项目：${options.cwd}\n只读观察；Ctrl+C 停止。`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
