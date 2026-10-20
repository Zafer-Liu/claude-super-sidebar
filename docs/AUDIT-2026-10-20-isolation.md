# Concurrent conversation isolation audit — 2026-10-20

Scope: Claude native hooks/state/parser/rendering, Codex model/reader/server/browser, current tests and public documentation. Existing files were untracked; no commits, user-level configuration changes, tests or builds were performed in this audit.

## Findings and fixes

| Priority | Concrete failure | Change |
| --- | --- | --- |
| P1 | An equal-size or larger in-place rollout rewrite could retain the previous session identity and parse replacement events under stale project attribution. | Reader compares a saved prefix before incremental reads and resets on changes, in addition to size and file identity. |
| P1 | A bound conversation could disappear when unrelated conversations filled the project-wide latest-100 window. | Server passes the requested thread to the store. Lightweight metadata resolves the root and descendants before the unbound discovery cap. Each queued request computes its own snapshot. |
| P2 | Conversation A received conversation B's read/parse health warnings. | Known-session warnings carry internal session IDs; the response flattens only warnings for the selected root and descendants. Global discovery failures remain global. |
| P2 | An excluded file replaced by a matching-project file was never re-probed. | Discovery re-probes entries without retained readers; cached metadata contains identity/project/parent only. |
| P2 | A cached file replaced with a symlink could bypass the initial discovery boundary. | Reopening validates every relative path component and the resolved containment boundary. This is a local observer, not an adversarial filesystem sandbox; check/open races are not eliminated. |
| P2 | A delayed completion for an older turn could terminate a newer turn. | Explicit mismatched terminal-event turn IDs are ignored; legacy events without IDs remain supported. |
| P2 | An older successful plan result could overwrite a newer successfully acknowledged plan. | Monotonic plan revisions prevent rollback on out-of-order results. |
| P2 | A late native failure for the second call in a grouped step could be lost after its output. | A bounded call-to-step association survives result completion for the turn. |
| P2 | Evicting the last pending correlation could leave a visible step permanently in progress. | Eviction settles the visible step as unknown when no correlated calls remain. |
| P2 | Repeated public progress text used different length limits across event sources and split one work stage. | Both message paths apply the same per-part limit and final progress normalization. |
| P2 | A reused Claude engine interface after session identity changes could keep accumulated panel data or accept an old delayed tool completion. | State records session identity; startup resets on identity change, preserves same-session reloads, and clears runtime tool tracking. Refresh/tool/spawn/turn-complete writes guard their captured identity. |

## Isolation design

- Claude panel atoms are host session-scoped; no cross-session persistent store is used. Runtime locks/tool maps are keyed by engine interface. Pane IDs are resolved by the host within that session.
- Codex file parser state is per reader. Shared reader access is serialized, while each request retains its own thread parameter and produces its own snapshot.
- Codex API filters both session data and associated warnings by root plus descendants. Missing roots return no other conversation.
- Browser binding, expansion state, and refresh guard are local to each tab. URL thread binding overrides the server default.
- HTTP remains loopback-only with Host/Origin/Fetch Metadata checks, restricted methods/assets, CSP, and text-based rendering.

## Verification performed

- `node --check` succeeded for `model.mjs`, `reader.mjs`, `server.mjs`, and browser `app.js` (syntax checks only).
- Started the actual server with independent synthetic records in `verification/2026-10-20-isolation/fixture` using the Browser preview tools.
- Concurrent requests for `audit-a`, `audit-b`, and `missing` returned respectively only A, only B, and no sessions.
- A task title was `ALPHA isolated work`; B was `BETA isolated work`. A malformed line in B generated a warning only in B's response; A and the missing thread received no warning.
- Browser accessibility inspection of `?thread=audit-a` showed only A's agent and work step. Browser console had no errors and no failed network requests were reported.
- New regression cases cover session identity changes, late native callbacks, thread cap/parallel requests, file replacement recovery, warning filtering, turn correlation, and reversed plan acknowledgments. These cases were written but **not executed**.
- UTF-8/LF and local documentation references were checked. SVG illustration is XML-valid.

## Remaining verification and limitations

No tests/builds were run, following the user's standing constraint. Earlier 32-pass results in the previous audit apply to the earlier revision, not these changes. Claude native engine loading/hot reload and real simultaneous Desktop sessions were not rerun. The bounded browser check confirms the listed synthetic Codex case; it does not prove every host/version or event ordering error-free.

An explicit Codex `?thread=...` URL should be used for each conversation; a bare URL shares the server's fixed default binding. Duplicate rollout IDs use the most recently modified file, with a deterministic pathname tie-break, to avoid duplicate agent rows and conflicting ancestry. The local rollout format can change; missing terminal events cannot establish process liveness. A malicious concurrent filesystem swap can race path checks.

## Documentation

Both main READMEs now embed `docs/images/panel-overview.svg`, clearly marked as illustrative sample data. Historical real captures remain in the repository as evidence and are no longer the main preview image.
