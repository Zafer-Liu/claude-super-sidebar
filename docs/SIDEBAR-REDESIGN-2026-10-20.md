# Sidebar redesign verification — 2026-10-20

Implemented an editorial diagram sidebar for Claude native panes and the Codex browser companion. No conversation chooser, identity bar, or cross-conversation overview was added.

## Changes

- Neutral surfaces, fine node borders, status accents, orthogonal agent branches, and directional task connectors.
- A single-column sidebar, inline agent details, collapsed plans, short task explanations, and expandable long explanations.
- Chinese/English interface switching. Observed conversation text is preserved. Browser preference is per origin; native preference is saved under the current session identity.
- Existing native session guards and Codex thread filtering remain in place.

## Actual browser verification

The real local server served synthetic rollout records from the ignored `verification/2026-10-20-sidebar/fixture` directory. No live conversation data was used.

- 360px light: language toggle, expanded main-agent fields, long titles, no horizontal overflow.
- 480px dark: Chinese UI, plan and long explanation expansion, two isolated agent nodes, no horizontal overflow.
- Parallel A/B/missing API requests returned A plus its child, B only, and an empty result respectively.
- After an explicit synthetic new-turn event was appended to A, its DOM and API contained only `ALPHA new-round-only step.`; its previous plan disappeared. B retained `BETA independent conversation work.`
- Browser console reported no errors; network inspection reported no failed requests.
- Final short-explanation preview addition received a JavaScript syntax check; it was not part of the two screenshot passes.

## Native verification boundary

Source was synchronized to the current session's enabled development plugin folder. The desktop inspection during this turn still showed the previous native UI. The host reloads edited modules after the editing turn ends. The new native pane has therefore not yet received a live visual or simultaneous-session verification; browser evidence does not certify native painting.

UTF-8/LF, SVG source and diff whitespace were inspected. No local tests/builds, commit or push were run. Earlier tests that assert former pane headings may need updates before the next authorized test run.

## Explicit themes

White is now the default, independent of the operating system color scheme. White (`#ffffff`), Beige (`#f5efe3`), and Black (`#191a1d`) are selectable. Browser theme preference persists per origin; native theme and language preferences are stored under the current session identity.

Actual browser inspection at 360px with OS dark emulation confirmed a white default, correct beige/black background values, one selected theme control, no horizontal overflow, and black surviving a page reload. Theme switching retained the same thread and task; no B content appeared. The final preview was returned to white. Console had no errors.

Native source was synchronized for end-of-turn reload, but the new theme controls have not been visually verified in the native host. Native button chrome and expanded Markdown use host rendering; Markdown has no declared color/style override and may differ from the selected palette.

## Native reload inspection follow-up

Two bounded desktop inspections still showed the old `团队面板 · Team Panel` UI with no theme controls. White/Beige/Black native switching was therefore not exercised and is not verified.

The user-level installed plugin cache still contained the earlier renderer, while the development folder contained the new renderer. This is a confirmed stale installed source, but does not by itself prove which plugin location the running module selected. The installed hooks/types were backed up under the ignored local fixture directory; complete project hooks/types were then synchronized to both installed and development locations and byte hashes matched. The second inspection still showed the old running module. A source synchronization is not proof of a successful runtime reload.

No repeated sleep/touch/screenshot loop, tests/build, commit or push was performed. A subsequent host load must show the new theme controls before visual theme verification can continue.

## Plugin reinstall

Reinstalled `team-panel@team-panel-local` at user scope through the host-matching CLI, preserving plugin data. Uninstall and install both returned `outcome: ok`. Plugin inventory reports version `0.2.0`, enabled, with `readFromFolder` pointing to the current project. The prior installed version was `0.1.0`.

Desktop inspection after reinstall still showed the old running pane without theme controls. The CLI documents that updates require restart to apply. Reinstallation succeeded; native three-theme visual verification remains blocked until the running Code session reloads the plugin. No application restart was forced while this session was executing.

## Post-restart compiler diagnosis

After restart, the transcript showed a real native module compiler failure: the engine `$` object cannot be passed as a WeakMap/WeakSet key. This corrects the earlier incomplete cache-only diagnosis. Runtime tool/refresh coordination and preference-save queues now use session IDs. An additional validation failure required preferences atoms to be declared locally in modules that read them, rather than imported atom references.

The matching host CLI `plugin validate` now passes with marketplace-description and README-install guidance warnings. All listeners, state reads/writes and preference store calls were recognized. This was plugin validation, not a test suite or application build. Corrected files were synchronized to installed/development plugin locations. Native three-theme clicking remains unverified until end-of-turn reload; the visible right-hand page during inspection was the Codex browser preview, not the native pane.

## Native container-only colors after application restart

A later application restart loaded the container-only implementation. Real native captures confirmed white, beige and black agent/task/preferences containers while headings, gaps and the bottom background remained white. Black-container Refresh, Collapse, EN and color controls showed readable white labels. White was restored and its selected label observed. These captures precede the stage-flow redesign below and do not verify its parsing behavior.

## Synchronized stage-flow update

Claude and Codex are being updated together to aggregate observed operations into stages, separate action titles from outcomes, expose bounded operation details, and distinguish operation completion from assistant-reported verification conclusions. Codex container colors are being aligned with the verified native container-only behavior. Verification results for this update are recorded only after actual inspection.

### Stage-flow browser verification (Codex adapter)

Verified against the controlled `rollout-stage-check.jsonl` fixture on the real local server (port 4322). The fixture interleaves out-of-order tool outputs, an explicit pass report, an explicit "not yet verified" outcome, an explicit failure report whose evidence contains 不足, and a plan.

- Three stages were produced, not one card per call: 检查容器配色 (2 operations), 修复按钮对比度 (1 operation), 复查按钮显示 (1 operation). Consecutive calls were grouped under the action prose that opened each stage; an explicit new action (我会复查…) split a new stage.
- Operation completion is labeled 操作完成 / Operation complete, never "verified". Verification is a separate row: 验证 · 通过 · 对话报告, 验证未观测, 验证 · 失败 · 对话报告 for the three stages respectively.
- The negation classifier rejects 尚未验证 / mixed (通过，但…失败) / future (将会验证) / uncertain (可能通过) statements as unknown, while still accepting 验证失败：…对比度不足 as failure evidence. Both the native (`hooks/steps.ts`) and Codex (`codex/model.mjs`) classifiers pass the same 16-case edge set.
- The plan is rendered once in the plan section and excluded from the task-flow list (no duplication). Plan-kind tasks no longer reuse stale outcome prose as their subject.
- Operation detail rows expand to show meaningful titles (检查侧栏布局, 检查界面显示) rather than raw tool identifiers, with per-operation status and the assistant-reported evidence labeled 对话报告.
- Container-only themes confirmed in all three: white/beige/black change only the agent/step/plan/preferences containers; the page background stays white (#ffffff) and section headings keep their default ink throughout. Black containers use light text (#e6e6e1).
- English rendering verified (Task flow, Operation complete, Verification · Passed · Conversation report, Verification not observed). A/B/missing thread isolation intact: A returns A plus its child, B returns B only, a missing thread returns an empty list. Browser console reported no errors.

Two grouping defects were found by this inspection and fixed before the pass: a missing Chinese action verb (复查) that prevented an explicit new action from splitting a stage, and plan-kind tasks inheriting stale outcome prose as their subject.

### Stage-flow native boundary

The native adapter (`hooks/steps.ts`, `hooks/pane.tsx`, `hooks/i18n.ts`, `types/index.d.ts`) implements the same stage contract and passed `plugin validate` and UTF-8/LF/diff checks. Source was synchronized byte-identical to the development and installed plugin locations. The host reloads edited modules only after the editing turn ends, so the native stage-flow UI has not yet received a live visual verification; the browser evidence above certifies the Codex adapter and the shared contract, not native painting. Native stage rendering, operation expansion, and the 操作完成/验证 labels must be inspected in the desktop pane after the next reload before they are called verified.

## Mid-priority refinements

Four mid-priority improvements were implemented, synchronized across both adapters.

### Stable control position

The preferences container keeps its original place at the bottom of the panel, below the task flow, on both the native pane and the Codex page — the user asked to restore the original layout rather than move the controls up, so they do not take top visual space. Expansion state is preserved across refreshes (native via the `selected` panel state, Codex via the `explanations`/`expanded` maps plus a static `<details id="version">` outside the rebuilt nodes). Codex also retains `window.scrollY` and the focused `details` across renders. Verified in the browser: the version details stayed open across a 2-second poll cycle, and the section order is agents → flow → preferences.

### Visible running version

A collapsible version block was added to the preferences container on both ends. It shows the plugin version (read from `plugin.json` / `package.json`) and an implementation revision — a short content hash of the loaded modules, so a hot reload that changes the code shows a different revision. The Codex side exposes it via a new `/api/version` endpoint. Verified in the browser: 插件版本 0.2.0, 实现修订 1esc04e, expanding and collapsing correctly, localized in both languages.

### Clearer token accounting

Token labels now distinguish 本轮输入 (latest-turn input) from 会话累计（含缓存）(session total including cache) and 上下文上限 (context limit), so a multi-million cumulative figure is no longer confused with the current context. Unavailable values show 暂无数据 / Unavailable rather than a misleading number. Verified in the browser against the sidebar-a fixture: Token 用量 24,800 · 会话累计（含缓存）, 本轮输入 14,800 tokens, 上下文上限 200,000 tokens.

### Complete English coverage

Verified programmatically that every tool-action label produced by the parsers (29 native, 31 Codex) and every generated data-layer title has an English translation, and that the Codex copy block has full zh/en key parity (55/55). User-supplied prose and actual work descriptions are never translated. Verified in the browser: Version / Plugin version / Implementation revision / Container color / Preferences all render in English.

### Mid-priority native boundary

The native changes (preferences retained below the task flow, version block, token labels) passed `plugin validate` and were synchronized byte-identical to both plugin locations. As with the stage-flow update, the host reloads edited modules only after the editing turn ends, so the native visual result is unverified until the next reload; the browser evidence certifies the Codex adapter and the shared layout/labeling contract only.

### Native verification after reinstall and restart

After a plugin reinstall (`team-panel@team-panel-local`, version 0.2.0, enabled, read from the project directory) and an application restart, the native pane was inspected on the desktop. All four mid-priority improvements are confirmed in the native render:

- The preferences container (语言 / 容器配色 / 版本信息) sits at the bottom, below the task flow, preserving the original layout.
- The version block expands to show 插件版本 0.2.0 and 实现修订 1uucn9t. The revision matches the independently computed content hash of the loaded hook modules, confirming the running code is the new code. (The Codex revision differs because it hashes the Codex adapter files; each side identifies its own implementation.)
- The main agent's detail rows distinguish Token 用量 (暂无已完成回合统计 when no completed turn) from 当前上下文 (193,219 tokens observed live).
- The task flow shows an aggregated stage title (重启完成，我来验证原生面板的实际渲染) rather than a raw tool name, with 操作完成 / 验证：未知 as separate rows.

During inspection a click on the version toggle initially missed because the pane's 2-second refresh shifted the content under the cursor. The click landed on retry. The user later asked to keep the preferences at the bottom rather than move them up, so the layout was restored; the stable-position concern is instead met by the preserved expansion and scroll state.

## Low-priority items

### Container-color label

The theme selector was already renamed to 容器配色 / Container color in both adapters during the mid-priority work (native `hooks/i18n.ts`, Codex `codex/public/index.html` and `app.js`). Confirmed in current sources; no further change needed.

### Documentation and diagram sync

`docs/images/panel-overview.svg` was rewritten as a single-column 760×980 illustration matching the current UI: agent relationships (main agent with running status, token rows showing 会话累计（含缓存）/本轮输入, subagent with connector), a three-stage task flow (检查容器配色 / 修复按钮对比度 / 复查按钮显示 with 操作完成 and separate 验证 rows, directional arrows), and the beige preferences container with 容器配色 buttons and the version line. The SVG was rendered in a real browser and visually inspected top and bottom; it paints correctly.

README.md and README.zh-CN.md were synchronized: the preview image alt and caption now describe the single-column layout and container-only colors; the usage table lists 代理关系 / 任务流 / 偏好设置 (including the collapsible version block); the "How it works" ASCII diagram shows the single-column native pane structure. `codex/README.md` was checked and already describes container colors and stage-grouped flow accurately. Historical audit and verification documents were left unchanged as historical records.

Static checks: `git diff --check` clean; README.md, README.zh-CN.md and the SVG are UTF-8 with LF line endings. No tests/build, no commit.

## Native response-boundary redesign and restart verification

The native adapter now uses main-agent turn.step response boundaries, with tool.call updates attached to their response stage. Visible assistant text provides the title and summary; tool-only stages derive their titles from observed operation labels. Empty response placeholders are hidden. The collapsed view exposes up to three operations and their states; unrecorded verification is available in expanded details rather than repeated on every collapsed card. Preferences remain below the flow. Codex retains its action-prose/category grouping; the native streaming lifecycle was not ported to the rollout adapter.

After user-scope reinstall and manual restart, actual native desktop captures confirmed descriptive tool-only titles, visible collapsed operation rows, and a running operation changing to completed before the turn ended. Two concurrent read calls appeared in one stage with separate completed operation rows. An intentional missing-file read marked both its operation and containing stage failed, while subsequent stages continued. The concurrent calls were not captured in a mixed completed/running state, so that intermediate state remains unverified.

Native English switching was attempted but the button was not successfully activated as new stages moved the bottom controls. Native English rendering remains unverified; the interface stayed Chinese. This is a remaining usability concern, not a verified localization failure.

Pre-publication checks passed: host plugin validation (existing marketplace-description and README-install guidance warnings), git diff --check, and UTF-8/LF checks. No tests or builds were run.
