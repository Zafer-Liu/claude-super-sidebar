# Codex 只读适配

本目录为已有 Codex CLI/App 会话提供配套浏览器面板，不创建、恢复或发送对话，不执行模型或工具。保留 Claude 插件的“团队面板 / 任务流 / 计划”结构和状态颜色。

## 启动

需要 Node.js 22.18+。没有第三方运行时依赖，无需安装 npm 包。

```powershell
# 从仓库根目录启动，观察指定项目
npm run codex -- --cwd "/absolute/path/to/project"

# 自定义数据目录和端口
node codex/server.mjs --cwd "/absolute/path/to/project" --codex-home "/absolute/path/to/codex-home" --port 4318
```

默认打开 [http://127.0.0.1:4317](http://127.0.0.1:4317)。可在普通浏览器或 Codex App 的浏览器侧栏中使用，保持终端进程运行，`Ctrl+C` 停止。

每个面板固定对应一个对话，不显示“当前会话”下拉框或项目路径。启动时优先使用 `--thread ID`，其次使用 `CODEX_THREAD_ID`；也可以使用 `/?thread=完整对话ID` 为每个浏览器标签单独绑定。均未提供时，服务首次读取后固定一个最近对话，页面将绑定写入自身 URL。刷新、重开标签或其他对话产生新记录均不会自动切换。绑定对话的记录缺失时显示等待，不回退到其他对话。

`--cwd` 默认为启动命令的当前目录，并进行完整路径匹配；Windows 下忽略大小写。数据目录优先级为 `--codex-home`、`CODEX_HOME`、用户主目录下的 `.codex`。不会读写 `config.toml`、登录凭据或状态数据库。

## 数据流

```text
Codex CLI / App → 本地 sessions/rollout-*.jsonl
                         ↓ 增量读取
                  归一化会话及工具状态
                         ↓ 本机 HTTP
                  团队面板 / 任务流 / 计划
```

| 本地记录 | 显示内容 |
| --- | --- |
| `session_meta` | 会话 ID、项目、来源、版本，`source.subagent.thread_spawn` 父子关系 |
| `turn_context` | 模型 |
| `event_msg.task_started` | 新回合，清空上一轮步骤和计划 |
| `task_complete` / `task_completed` / `turn_aborted` / `task_failed` / `error` | 已完成、停止、失败等最后观测状态 |
| `response_item.function_call` / `custom_tool_call` | 工具步骤；以 `call_id` 关联结果，支持并行调用 |
| `function_call_output` / `custom_tool_call_output` | 完成或可识别的失败标记、退出码；不把原始输出返回浏览器 |
| 成功的 `update_plan` 调用 | 计划步骤与状态；失败的更新不替换已确认计划 |
| `event_msg.token_count` / `token_usage_record` | 会话累计用量、最近请求输入 Token、可观测上下文上限 |

任务流优先从助手公开的进度说明提取标题与摘要，同一段说明后连续执行的多个工具归并为一个工作步骤，所有结果返回后才显示完成；任一工具失败会保留失败状态。没有进度说明时使用调用的 `description` / `title` 或中文操作名称，不直接显示 `exec`、`js` 等包装层名称。不会显示隐藏推理、完整命令、补丁内容、原始工具输出或用户提示词；不会额外调用模型生成摘要。嵌套在通用 `exec` 中的多个操作按外层调用观察，不能保证还原其内部工具树。

读取按字节偏移增量进行，处理跨块 UTF-8 和尚未写完的末行；文件缩短或替换时重新解析。未知记录类型忽略，损坏行跳过并提示，不将缺失结果判定为成功。每五秒发现新文件，每两秒刷新已有记录。未绑定时最多读取最近更新的 100 个会话；明确绑定的对话及其后代不受其他对话挤占，每轮保留 30 个步骤，最多保留 60 项计划。

## 安全与边界

- 仅绑定 `127.0.0.1`，检查 Host、Origin 和 Fetch Metadata，不开放 CORS；只支持 GET/HEAD。
- 静态资源使用固定白名单，没有读取任意路径或执行命令的 HTTP 接口。发现会话时跳过符号链接。
- API 在指定项目中进一步按 `thread` 过滤，仅返回该对话及其后代的归一化状态；不返回其他根对话、顶层项目路径或日志原文。所有会话文本通过 `textContent` 渲染，使用严格 CSP，页面没有外部资源或遥测。
- 本机同一用户启动的进程可以访问此面板，面板不是多用户鉴权服务。勿通过代理暴露到局域网或公网。
- 会话文件是本地实现格式，**不是 App Server RPC 协议**。当前兼容性基于 Codex 0.162.1 的本机记录；升级后应运行回归并检查实际会话。
- 仅支持当前数据目录中、同一项目路径下已落盘的活动会话。远程/云端、临时、归档、其他主机，以及使用不同项目路径的子代理不包含在内。
- 未收到结束记录时保留最后状态，不推断仍在运行或已完成；耗时使用已观测时间，不冒充进程存活检测。Token 累计不重复叠加缓存或推理子项；最近输入不等于实时上下文占用。

OpenAI 的 [App Server 文档](https://learn.chatgpt.com/docs/app-server)描述了建立自有 Codex 客户端的正式协议；本项目为了旁观已有 CLI/App 对话而选择只读日志适配，因此不会订阅或接管另一客户端的会话。

## 验证

```bash
npm test
```

测试使用合成记录，覆盖解析、回合边界、并行结果、计划、追加与损坏恢复、项目隔离、符号链接、HTTP 边界，以及 Claude 任务流/钩子回归。Claude 测试通过 Node 内置 TypeScript 剥离读取原有源码，钩子使用最小宿主替身，不能替代真实 Claude 引擎及原生面板验证。
