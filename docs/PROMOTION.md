# Promotion Kit

Ready-to-use copy for launching and listing **Claude Super Sidebar**.

Repository: https://github.com/Zafer-Liu/claude-super-sidebar
Plugin ID: `super-sidebar` · Marketplace: `super-sidebar`

> Naming note: the product and repository are **Claude Super Sidebar**, but the plugin
> installs as `super-sidebar`. A plugin ID cannot start with `claude-`, which the host
> reserves. Use "Claude Super Sidebar" for the product, and `super-sidebar` in every
> install command.

---

## 1. Directory listing copy (claude.ai/directory)

Submitted through the developer portal. Keep these under the field limits.

**Name (displayName)**
```
Super Sidebar
```

**Tagline (≤ 30 words)**
```
See your agents. Follow the work. A native Claude pane for agent trees, live status, and conversation task flow.
```

**Short description**
```
Claude Super Sidebar brings the main agent, its subagents, execution details, and the current conversation's work steps into one native pane. Agent relationships render as a tree with directional connectors; work steps group into stages with concise titles, status, and separate verification conclusions. A read-only local panel does the same for standalone Codex sessions by reading persisted session files.
```

**What it does**
```
- Agent relationships: main agent and subagents in one tree, expandable in place.
- Execution status: running, waiting, completed, and failed, with elapsed time.
- Agent details: model, mode, role, observed token usage, context usage, tool-call count.
- Conversation task flow: operations grouped into stages, with bounded details on expansion.
- Per-request scope: each new request clears the previous flow.
- Local parsing: deriving the flow needs no additional model call.
```

**Requirements / disclosure**
```
Requires a Claude Desktop Code host exposing the native hook-module and pane APIs, plus the matching Claude Code CLI for installation. Hooks are ignored on claude.ai chat; the pane renders only in Claude Code and Cowork. The Codex panel requires Node.js 22.18+ and local Codex sessions.
```

---

## 2. GitHub Release notes (v0.2.0)

```markdown
## See your agents. Follow the work.

Claude Super Sidebar puts the main agent, its subagents, execution details, and the
current conversation's work steps into one native pane — with a read-only local panel
for standalone Codex sessions.

### Install

Add the marketplace, then install the plugin:

    claude plugin marketplace add Zafer-Liu/claude-super-sidebar
    claude plugin install super-sidebar@super-sidebar

Then start a new Code session. The pane opens on session startup; type `/super-sidebar`
to reopen it.

### What you get

- **Agent relationships** — main agent and subagents in one tree, with directional
  connectors and details that expand in place.
- **Execution status** — running, waiting, completed, and failed, with elapsed time.
- **Agent details** — model, mode, role, observed token usage, context usage,
  elapsed time, and tool-call count.
- **Conversation task flow** — operations grouped into work stages, with concise
  action titles and bounded details on expansion. Failures and missing results are
  preserved.
- **Per-request scope** — each new request clears the previous flow.
- **Local parsing** — deriving the flow requires no additional LLM call.

### Codex

Standalone Codex CLI/App gets a read-only local session dashboard:

    npm run codex -- --cwd "/absolute/path/to/your/project"

No `npm install`, API key, or Codex configuration change is required.

### Notes

Developed against Claude Code engine 2.1.299 using an early-access plugin API. The host
must support hook modules, `claude-code` imports, and native `ui.render` panes. The Codex
rollout format is not a stable public API; compatibility is limited to tested local versions.

Apache-2.0.
```

---

## 3. Social posts

### Short (X / Threads / Mastodon)

```
Claude Code shows you a transcript. Claude Super Sidebar shows you the shape of the work.

Agent tree, live status, and stage-grouped task flow — in one native pane. No frontend build, no extra model call.

claude plugin marketplace add Zafer-Liu/claude-super-sidebar
```

### Longer (LinkedIn / Reddit r/ClaudeAI)

```
When several subagents run at once, the transcript stops being a good interface. You
can read what happened, but not see who is doing what right now.

Claude Super Sidebar adds a native pane to Claude Desktop Code: the main agent and its
subagents as one tree, each with live status and elapsed time; execution details such as
model, mode, and observed token usage; and the current conversation's work steps grouped
into stages, with verification conclusions kept separate from execution.

Two deliberate constraints:

- Parsing is local. Deriving the task flow requires no additional model call.
- Status is observed, not inferred. "Operations completed" describes tool execution
  only. An exit code of zero never proves product behavior.

There is also a read-only local panel for standalone Codex sessions, which reads
persisted session files rather than driving conversations.

Install:
  claude plugin marketplace add Zafer-Liu/claude-super-sidebar
  claude plugin install super-sidebar@super-sidebar

Apache-2.0. Source and validation notes: https://github.com/Zafer-Liu/claude-super-sidebar
```

### Chinese (V2EX / 即刻 / 小红书)

```
Claude Code 给你一份对话记录。Claude Super Sidebar 给你工作的形状。

主代理与子代理的关系树、实时状态、按阶段分组的任务流 —— 全部在一个原生面板里。
无需构建前端，不额外调用模型生成摘要。

安装：
  claude plugin marketplace add Zafer-Liu/claude-super-sidebar
  claude plugin install super-sidebar@super-sidebar

另外提供 Codex 本地只读会话面板，读取本机会话文件，不驱动对话。

Apache-2.0，源码与验证记录：https://github.com/Zafer-Liu/claude-super-sidebar
```

---

## 4. Awesome-list submissions

Open a PR adding one line under the appropriate section. Verify the list is still
active and check its contribution rules before submitting — several of these lists
gate on star count or require a specific entry format.

| Repository | Section to target | Notes |
| --- | --- | --- |
| [ccplugins/awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins) | Plugins / UI | Covers slash commands, subagents, MCP servers, and hooks. |
| [sujayjayjay/awesome-claude-code-skills](https://github.com/sujayjayjay/awesome-claude-code-skills) | Plugins | Categorized with install instructions. |
| [omgits0mar/awesome-claude-code-extensions](https://github.com/omgits0mar/awesome-claude-code-extensions) | Plugins | Searchable index covering both Claude Code and Codex. |
| [itgoyo/awesome-claude-code](https://github.com/itgoyo/awesome-claude-code) | Tools | Has an "Awesome Lists & Collections" section. |
| [subinium/awesome-claude-code](https://github.com/subinium/awesome-claude-code) | Skills & Plugins | **Only lists repos with 1,000+ stars.** Wait until the project qualifies. |

Suggested entry line:

```markdown
- [Claude Super Sidebar](https://github.com/Zafer-Liu/claude-super-sidebar) — Native Claude pane for agent relationships, live status, and conversation task flow, plus a read-only local Codex session panel. Apache-2.0.
```

---

## 5. Repository metadata suggestions

GitHub topics are already set. Two optional additions that help discovery:

- **Set the repository homepage** to `https://www.zaferliu.me` or a project page, so the
  GitHub sidebar links somewhere useful.
- **Tag a release.** `claude plugin tag` creates a `{name}--v{version}` tag. Tags matter
  when another plugin declares a version range on yours; otherwise they are optional.

---

## 6. Not viable — recorded so it is not retried

**Codex public plugin directory (shared by ChatGPT and Codex).** Three hard blockers:

1. A direct archive upload must include at least one skill at `skills/<skill-name>/SKILL.md`.
   This project has none — its value is a native pane, which a skill cannot render.
2. Lifecycle hooks are explicitly ineligible: *"Remove lifecycle hooks before public
   directory submission."* Hooks are the plugin's core mechanism.
3. The guide requires contacting an OpenAI partner when core value needs local execution
   or access to files on the user's computer. This plugin reads local session data.

Submission would additionally require Apps Management Write access, identity verification,
five positive and three negative test cases, a demo video, and domain verification.

**`claude-plugins-official`.** Anthropic's official marketplace does not accept directory-portal
submissions. A listing requires an Anthropic partner contact.

**Codex distribution that does work:** the repo-level marketplace at
`.agents/plugins/marketplace.json`, verified against Codex CLI 0.162.1:

    codex plugin marketplace add Zafer-Liu/claude-super-sidebar

---

## 7. Pre-submission checklist for the Claude directory

Run before submitting. The portal applies extra rules the CLI does not check.

- [ ] Confirm a paid claude.ai plan (Pro/Max/Team/Enterprise). Free accounts cannot submit.
- [ ] Run `claude plugin validate ./ --strict` with a matching CLI and fix every warning.
- [ ] Submit from [claude.ai/directory/manage](https://claude.ai/directory/manage) →
      **Create plugin** → **Plugin bundle**.
- [ ] Confirm the README uses Markdown image syntax for bundled images. HTML `<img>` is held
      for a reviewer. **Done** — both READMEs use Markdown syntax.
- [ ] Confirm `plugin.json` sets `description`, `author`, and `version`. **Done.**
- [ ] Confirm no `bin/` directory exists at the plugin root. A `bin/` directory makes
      claude.ai and Cowork refuse the whole plugin. **Confirmed absent.**
- [ ] Decide whether to narrow the plugin folder. The plugin root is the repository root, so
      installs include `codex/`, `docs/`, and `verification/`. Not a violation, but the
      package is larger than it needs to be.
- [ ] Expect a reviewer hold if the name reads as generic. `super-sidebar` is more
      distinctive than the previous `team-panel`, which reduces this risk.
