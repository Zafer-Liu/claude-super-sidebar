# Color flow verification

Verified in the actual Claude Desktop Code plugin pane on 2026-10-19 after hot reload.

- The pane heading reads 代理流程图.
- The running main agent has a pale green background and green outline.
- The completed Explore agent has a pale blue background and blue outline.
- A blue elbow arrow and 主代理 → Explore label appear between the nodes.
- Clicking Explore expands its details inside the blue node; clicking again collapses it (collapsed.png).
- Reopening Explore and pressing Refresh preserves the expanded node (expanded-after-refresh.png).
- Status, mode, role, model/token availability, elapsed time and Markdown activity are visible inside the expanded node.

Only running and completed node states were present during live verification. Waiting and failed appear in the color legend; live nodes in those states were not exercised. The older Explore agent has no observed model/token usage. No tests/build, commit or push were run.
