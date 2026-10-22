# Current validation — 2026-10-20

Version 0.2.0 adds a dependency-free, read-only Codex companion panel. Node.js 22.18+ is required for the dashboard and portable tests. No package installation or frontend build is needed.

```bash
npm test
npm run test:claude
npm run test:codex
npm run codex -- --cwd "/absolute/path/to/project"
```

See [Codex integration](codex/README.md), the [audit](docs/AUDIT-2026-10-20.md), and [verification evidence](verification/2026-10-20-codex/README.md). Portable tests cover the real Claude model/parser source and lifecycle behavior through a minimal mock host; they do not replace the original engine-specific pane tests.

Historical audit before the latest isolation fixes: 32 portable tests passed (9 Claude, 23 Codex). New isolation regressions have not been executed; see [current audit](docs/AUDIT-2026-10-20-isolation.md). The current native pane test assertions have been corrected to match the implemented headings. Native engine tests and current Desktop loading were not rerun: Claude Desktop is installed, but a compatible runnable Claude Code CLI was not found. Earlier prototype results below are historical and do not certify the current source.

# Historical prototype validation

Developed against local Claude Code engine 2.1.299.

- `claude plugin validate`: passes. Event listeners, session state and pane recognized.
- `claude plugin test`: 5 pass, 0 fail. Includes task ownership/deletion, retained completion, cycle/orphan termination, SVG escaping, Desktop and terminal element-tree validation.
- The engine test validates element descriptions; it does not test actual Desktop painting.
- No application build, package installation, git commit or prototype push performed.
- Actual live Desktop rendering awaits the session dev-mod hot-reload decision and end-of-turn load.

The plugin uses an early-access engine API. Plugin name is `super-sidebar`; `claude-` names are reserved by the engine.

## Data correctness

Roster is authoritative for visible agents; observed finished members are retained when removed from the roster. Missing members keep their last observed state rather than being guessed complete. Main loop activity comes from turn events. Tool contents are not stored; only tool name and a completion marker. Tasks are consumed only from successful tool results. Tasks and agents have distinct statuses.

## Deferred

Cross-session history, workflow-agent integration, main/child transcript navigation, dragging/zoom/pan, theme-aware SVG palette, task creation UI, and usage/budget counters.
