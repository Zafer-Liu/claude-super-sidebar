import { opendir, open, realpath, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { applyRecord, createSession, snapshot } from './model.mjs';

const MAX_LINE = 8 * 1024 * 1024;
const CHUNK = 256 * 1024;
const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);

// Reject symlinks, and never take file paths from an HTTP request.
async function confined(root, file) {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Outside session directory');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic session path');
  }
  const resolved = await realpath(file), boundary = await realpath(root);
  const actual = path.relative(boundary, resolved);
  if (actual.startsWith('..') || path.isAbsolute(actual)) throw new Error('Outside session directory');
}

async function discover(directory, depth = 0) {
  const files = [];
  let entries;
  try { entries = await opendir(directory); } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for await (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && depth < 3 && /^\d{2,4}$/.test(entry.name)) files.push(...await discover(file, depth + 1));
    else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) files.push(file);
  }
  return files;
}

export class RolloutReader {
  constructor(file) { this.file = file; this.reset(); }
  reset() {
    this.offset = 0; this.rest = ''; this.dropping = false;
    this.decoder = new StringDecoder('utf8'); this.state = createSession();
    this.invalidLines = 0; this.identity = undefined; this.prefix = Buffer.alloc(0);
  }
  consume(chunk) {
    const lines = (this.rest + this.decoder.write(chunk)).split('\n');
    this.rest = lines.pop();
    for (const line of lines) {
      if (this.dropping) { this.dropping = false; continue; }
      if (line.length > MAX_LINE) { this.invalidLines++; continue; }
      if (!line.trim()) continue;
      try { applyRecord(this.state, JSON.parse(line)); } catch { this.invalidLines++; }
    }
    if (this.rest.length > MAX_LINE) { this.rest = ''; this.dropping = true; this.invalidLines++; }
  }
  async read({ headerOnly = false } = {}) {
    const handle = await open(this.file, 'r');
    try {
      const info = await handle.stat(), identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
      if (info.size < this.offset || (this.identity && identity !== this.identity)) this.reset();
      const prefix = Buffer.alloc(Math.min(512, info.size));
      await handle.read(prefix, 0, prefix.length, 0);
      if (this.prefix.length && !prefix.subarray(0, this.prefix.length).equals(this.prefix)) this.reset();
      this.prefix = prefix;
      this.identity = identity;
      const buffer = Buffer.alloc(CHUNK);
      while (this.offset < info.size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(CHUNK, info.size - this.offset), this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead; this.consume(buffer.subarray(0, bytesRead));
        if (headerOnly) break;
      }
      return snapshot(this.state);
    } finally { await handle.close(); }
  }
}

export class SessionStore {
  constructor({ sessionsDir, cwd, maxSessions = 100 }) {
    this.sessionsDir = path.resolve(sessionsDir); this.cwd = path.resolve(cwd);
    this.maxSessions = maxSessions; this.files = new Map(); this.lastScan = 0;
    this.inflight = undefined; this.cached = { sessions: [], warnings: [] };
  }
  async refresh(threadId = '') {
    // Serialize shared file readers, but never reuse another thread's snapshot.
    const request = (this.inflight ?? Promise.resolve()).catch(() => {}).then(() => this.load(threadId));
    this.inflight = request;
    try { return await request; }
    finally { if (this.inflight === request) this.inflight = undefined; }
  }
  async load(threadId = '') {
    const warnings = [], sessionWarnings = [];
    const warn = (entry, message) => sessionWarnings.push({ sessionId: entry.metadata.id, message });
    if (Date.now() - this.lastScan > 5000) {
      const files = await discover(this.sessionsDir), live = new Set(files);
      for (const file of this.files.keys()) if (!live.has(file)) this.files.delete(file);
      for (const file of files) if (!this.files.has(file) || !this.files.get(file).reader) {
        // Metadata is needed to enforce the project boundary before full replay.
        const reader = new RolloutReader(file);
        try {
          await confined(this.sessionsDir, file);
          const root = await realpath(this.sessionsDir), resolved = await realpath(file);
          const relative = path.relative(root, resolved);
          if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
          await reader.read({ headerOnly: true });
          const { id, project, parentId } = snapshot(reader.state);
          const metadata = { id, project, parentId };
          if (!metadata.id) continue; // An incomplete first line may arrive on the next scan.
          this.files.set(file, { file, metadata,
            reader: metadata.project && samePath(metadata.project, this.cwd) ? reader : undefined });
        } catch { warnings.push('部分会话记录暂时无法读取，将在下次扫描重试。'); }
      }
      this.lastScan = Date.now();
    }
    const selected = [];
    for (const entry of this.files.values()) {
      if (!entry.metadata.id || !entry.metadata.project || !samePath(entry.metadata.project, this.cwd)) continue;
      try { selected.push({ entry, mtime: (await stat(entry.file)).mtimeMs }); }
      catch { warn(entry, '某个会话记录已移动或无法读取。'); }
    }
    selected.sort((a, b) => b.mtime - a.mtime || a.entry.file.localeCompare(b.entry.file));
    // A copied rollout must not duplicate one agent or introduce conflicting
    // ancestry. The most recently modified file is authoritative for each ID.
    const seen = new Set();
    for (let i = 0; i < selected.length;) {
      const id = selected[i].entry.metadata.id;
      if (seen.has(id)) selected.splice(i, 1);
      else { seen.add(id); i++; }
    }
    const ids = new Set(threadId ? [threadId] : []);
    let added = Boolean(threadId);
    while (added) {
      added = false;
      for (const { entry } of selected) if (ids.has(entry.metadata.parentId) && !ids.has(entry.metadata.id)) {
        ids.add(entry.metadata.id); added = true;
      }
    }
    // Explicit bindings are resolved before the discovery cap. Unrelated active
    // conversations must not evict a bound root or any of its descendants.
    const scoped = threadId ? selected.filter(({ entry }) => ids.has(entry.metadata.id)) : selected.slice(0, this.maxSessions);
    const sessions = [];
    const retained = new Set(scoped.map(item => item.entry));
    for (const entry of this.files.values()) if (!retained.has(entry)) entry.reader = undefined;
    for (const { entry } of scoped) {
      try {
        await confined(this.sessionsDir, entry.file);
        entry.reader ??= new RolloutReader(entry.file);
        const view = await entry.reader.read();
        // Replay can detect truncation/replacement after discovery. Recheck the
        // new metadata before returning any state to the project-scoped API.
        if (!view.id || !view.project || !samePath(view.project, this.cwd)) {
          this.files.delete(entry.file);
          warn(entry, '会话记录的项目归属已变化，已停止展示，将在下次扫描重新检查。');
          continue;
        }
        entry.metadata = { id: view.id, project: view.project, parentId: view.parentId };
        sessions.push(view);
        if (entry.reader.invalidLines) warn(entry, '部分记录格式无法识别，已跳过；显示内容可能不完整。');
      } catch { warn(entry, '某个会话更新读取失败，将重试。'); }
    }
    this.cached = { sessions, warnings: [...new Set(warnings)], sessionWarnings, project: this.cwd, updatedAt: Date.now() };
    return this.cached;
  }
}
