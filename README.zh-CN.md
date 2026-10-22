![Claude Super Sidebar — 原生代理状态与任务流面板](docs/images/banner.svg)

<p align="center">
  <strong>看见代理状态，跟进每一步工作。</strong><br />
  Claude 原生面板与 Codex 本地会话面板。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/version-0.2.0-6689cd" alt="Version 0.2.0" />
  <img src="https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&amp;logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Claude-supported-32936b" alt="Claude supported" />
  <img src="https://img.shields.io/badge/Codex-local_panel-32936b" alt="Codex local panel supported" />
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#运行效果">运行效果</a> ·
  <a href="#安装">安装</a> ·
  <a href="#使用">使用</a> ·
  <a href="#codex-配置">Codex 配置</a> ·
  <a href="#开发">开发</a> ·
  <a href="#审计与验证">审计与验证</a>
</p>

## 简介

Claude Super Sidebar 将主代理、子代理关系、实时执行详情和本轮对话的工作步骤整合到一个面板中。Claude Code 使用原生插件面板；独立 Codex CLI/App 使用只读本地会话面板。两种模式均无需构建前端。

仓库与产品名称为 **Claude Super Sidebar**（`claude-super-sidebar`）。插件安装 ID 为 `super-sidebar`，原生面板标题为 **状态 · Status**。宿主保留 `claude-` 前缀，插件 ID 不能以 `claude-` 开头，产品名称保留在仓库与本文档中。Codex 页面标题为 **状态 status**，团队区域标题为 **团队面板 Team panel**。两种接入使用各自宿主的数据源，不需要额外调用模型生成任务摘要。

| 接入 | 数据源与界面 | 当前验证范围 |
| --- | --- | --- |
| Claude Desktop Code | 生命周期钩子与 `session.messages()` → 原生面板 | 历史可移植逻辑回归已通过；最新隔离回归尚未执行；当前版本的原生引擎校验与 Desktop 重载待验证 |
| Codex CLI / App | 本机 `sessions/rollout-*.jsonl` → 只读浏览器面板 | 历史适配/HTTP 回归已通过；最新隔离回归尚未执行；本机真实 App 会话和页面已验证 |

## 运行效果

![单列布局的代理关系、阶段分组任务流与偏好设置示意图](docs/images/panel-overview.svg)

界面示意图，使用虚构示例数据，并非运行截图。单列布局依次展示代理关系、按阶段分组的任务流和偏好设置。容器配色（白色、米色、黑色）仅作用于卡片，外围背景保持不变。Claude 原生面板与 Codex 浏览器面板的实际绘制有所不同。

## 功能

- **代理关系树**：主代理和子代理统一展示，使用方向连线表达上下级关系，详情可原位展开。
- **执行状态**：运行中、等待中、已完成和失败使用不同颜色。Claude 展示活动耗时；Codex 使用日志中的已观测时间，不判断进程是否仍存活。
- **代理详情**：展示模型、模式、团队角色、已观测 Token 用量、可用的上下文用量、耗时和工具调用次数。
- **对话任务流**：Claude 与 Codex 均将已观测操作合并为工作阶段，使用简短动作标题，展开后查看有界操作明细；结果说明与阶段描述分开，保留失败和缺失结果状态。
- **每轮独立展示**：新用户请求自动清空上一轮任务流，工具返回不会触发清空；最多展示最近 30 个步骤。
- **计划展示**：Claude 提取可观测计划正文；Codex 展示成功 `update_plan` 调用提交的计划，失败更新不会覆盖已有计划。
- **执行与验证分开**：“操作完成”仅表示工具执行完成；明确的验证结论保留对话原文依据并标注“对话报告”，退出码为零不代表产品行为正确。
- **容器配色**：白色、米色、黑色仅作用于卡片和偏好容器，外围背景保持不变；固定控件支持中文与英文。
- **本地解析**：整理任务流无需额外调用大模型。

## 环境要求

以下要求适用于 Claude 原生插件；Codex 本地面板仅需 Node.js 22.18+ 和已保存到本机的 Codex 会话。

- 提供原生 hook 模块与面板 API 的 Claude Desktop Code 宿主。
- 与宿主匹配的 Claude Code CLI，用于安装插件。
- 保存在稳定位置的本地项目副本。

项目基于 **Claude Code engine 2.1.299** 的早期插件 API 开发。宿主需要支持 hook 模块、`claude-code` 导入和原生 `ui.render` 面板。不同发行版本的 API 可用性可能不同。

## 安装

### Claude Desktop Code

直接从 GitHub 添加市场，再安装插件：

```bash
claude plugin marketplace add Zafer-Liu/claude-super-sidebar
claude plugin install super-sidebar@super-sidebar
```

更倾向本地克隆？在仓库根目录执行：

```bash
claude plugin install super-sidebar --marketplace . --scope user
```

检查 `super-sidebar@super-sidebar` 的安装范围是否为 `user`，且 `enabled` 是否为 `true`：

```bash
claude plugin list --json
```

如果已安装但未启用：

```bash
claude plugin enable super-sidebar@super-sidebar
```

安装后新建 Code 会话以加载插件。用户级安装适用于当前用户的各个项目。GitHub 市场安装的是缓存副本，克隆目录可放在任意位置；本地路径安装会从源目录读取，该方式请保留仓库位置。

如果 `claude` 不在 `PATH` 中，请使用宿主所配套 Claude Code 可执行文件的完整路径。项目覆盖设置和组织策略可能影响插件加载。

## 使用

以下为 Claude 原生插件操作。Codex 的启动与对话绑定见下方 [Codex 配置](#codex-配置)。

插件会在会话启动时尝试打开 **状态 · Status**。关闭后，在对话输入框中输入 `/super-sidebar` 可重新打开。

| 区块 | 展示内容 |
| --- | --- |
| 代理关系 · Agent relationships | 主代理、子代理、上下级连线和可展开的执行详情 |
| 任务流 · Task Flow | 按阶段分组的工作步骤，含简短标题、状态、操作明细和独立的验证结论 |
| 偏好设置 · Preferences | 语言、容器配色（白色／米色／黑色）和可折叠的版本信息（插件版本与实现修订） |

点击 **展开 / 收起** 查看或折叠代理详情。点击 **刷新** 可立即更新，面板也会每两秒自动刷新。

任务流中的箭头表示时间上的执行顺序。新用户请求自动开启新一轮任务流，无需手动管理任务。

## Codex 配置

### 在 Claude 宿主中使用 Codex 模型

如果 Claude Desktop 发行环境提供 Codex 模型，按上面的 Claude 安装步骤配置插件，然后在宿主模型菜单中选择 Codex 即可。此场景无需修改 Codex 配置文件：会话事件与原生面板 API 均由 Claude 宿主提供。

Claude Super Sidebar 不负责添加模型或配置模型服务商。

### 独立 Codex CLI 或 App

已支持**只读本地会话面板**。在本仓库根目录启动：

```bash
npm run codex -- --cwd "你的项目绝对路径"
```

打开 [本地状态面板](http://127.0.0.1:4317)。在 Codex App 中也可以要求代理将此地址打开到浏览器侧栏。无需 `npm install`、API Key 或修改 Codex 配置。省略 `--cwd` 时观察启动命令所在目录；在本仓库执行即观察本项目。

```bash
# 端口被占用或使用独立的 Codex 数据目录时
node codex/server.mjs --cwd "你的项目绝对路径" --port 4318 --codex-home "你的 Codex 数据目录"
```

面板每两秒增量读取 `CODEX_HOME/sessions`（默认 `~/.codex/sessions`）下的本地 JSONL 记录。每个面板固定对应一个对话及其子代理，展示本轮最近 30 个工作步骤、成功提交的工作计划及已观测用量。步骤摘要来自公开进度说明，不显示 `exec` / `js` 包装层名称；没有说明时使用调用自带标题或中文操作名称。顶部不显示会话选择和项目路径，任务流与页脚不再显示执行顺序和刷新机制说明。停止服务使用 `Ctrl+C`。

在 Codex 内启动时自动使用 `CODEX_THREAD_ID` 绑定当前对话；也可以指定 `--thread "完整对话 ID"`，或打开 `http://127.0.0.1:4317/?thread=完整对话ID`。没有指定时首次绑定最近的一个本地对话，之后不会随其他对话更新而切换。

```bash
# 显式绑定一个对话
npm run codex -- --cwd "你的项目绝对路径" --thread "完整对话ID"
```

服务已运行时，另一个对话使用它自己的 `?thread=...` 地址打开面板。URL 中的对话 ID 优先于服务默认绑定；所有对话仍限于服务启动时指定的项目路径。

这是独立浏览器界面，不会将 Claude 的 `ui.render` 注册到 Codex，也不接管对话。会话记录格式不是稳定的公开 API；当前在 **Codex CLI 0.162.1 / 本机 App 会话记录**上验证。未落盘、临时、远程和归档会话不在观察范围，异常退出也可能缺少终止事件。详细边界和事件映射见 [Codex 适配说明](codex/README.md)。

## 实现原理

```text
Claude Code 会话
  ├─ 代理 / 回合 / 工具事件 ──→ 代理状态与用量
  └─ 对话记录 ───────────────→ 按阶段分组的工作步骤
                                  │
                             会话级状态
                                  │
                          原生状态面板（单列）
                          ├─ 代理关系
                          ├─ 任务流（阶段、操作、验证）
                          └─ 偏好设置（容器配色、版本）
```

插件清单通过 `hooks/hooks.json` 加载 `hooks/register.tsx`。会话启动时注册命令与刷新定时器，生命周期 hook 观测执行过程，`session.messages()` 为任务流解析提供对话记录，原生组件和 SVG 连线负责绘制界面。

## 开发

在兼容的交互式 CLI 中，可以显式加载本地目录：

```bash
claude --plugin-dir .
```

Desktop 热加载开发需要调用内置 `/plugin-authoring` 技能，并在宿主提示时同意启用热加载。修改会在**当前回合结束后**加载。

使用配套 CLI 校验插件清单和 hook 模块：

```bash
claude plugin validate .
```

| 路径 | 职责 |
| --- | --- |
| [.claude-plugin/](.claude-plugin/) | 插件清单与本地插件市场 |
| [hooks/register.tsx](hooks/register.tsx) | 生命周期 hook、命令与刷新 |
| [hooks/pane.tsx](hooks/pane.tsx) | 原生面板与连线 |
| [hooks/steps.ts](hooks/steps.ts) | 对话任务流解析 |
| [hooks/model.ts](hooks/model.ts) | 状态和代理树辅助逻辑 |
| [types/index.d.ts](types/index.d.ts) | 插件状态类型契约 |
| [codex/](codex/) | Codex 只读适配、本地服务、浏览器界面和自动测试 |
| [verification/](verification/) | 历史截图与检查记录 |

## 审计与验证

本轮隔离修复之前的历史检查：`npm test` **32 项通过，0 项失败**。本轮补充了回归用例但未执行测试或构建，详见[当前隔离审计](docs/AUDIT-2026-10-20-isolation.md)。无需安装 npm 包即可分别复现：

```bash
npm run test:claude  # 9 项：真实模型/任务流源码，生命周期钩子使用模拟宿主
npm run test:codex   # 23 项：记录解析、文件增量读取、对话/项目隔离、HTTP/CLI
npm test            # 全部可移植测试
```

本次修复 Claude 并行工具结束时错误清空活动说明、原生面板测试引用旧标题，以及 Codex 文件替换后沿用旧项目归属的问题。详细证据见 [审计报告](docs/AUDIT-2026-10-20.md) 与 [验证记录](verification/2026-10-20-codex/README.md)。

Codex 已验证本机真实会话及页面；Claude 逻辑回归通过，但本次未找到可运行的兼容 Claude Code CLI，因此**未重新执行原生 `claude plugin validate` / `claude plugin test` 或 Desktop 加载验证**。当前结论是已覆盖的检查通过，不能宣称两种宿主在所有版本中均无误。历史安装与截图不替代当前原生宿主检查。

## 当前限制

- Claude Plan 提取有逻辑回归，但当前版本尚未完成原生面板验证；Codex 计划更新有成功/失败结果测试。
- 主代理上下文用量由宿主提供。不可用的子代理指标会标记为暂无数据；Token 统计来自已观测的完成回合，包含缓存 Token。
- 工作步骤受可用对话记录与进度消息分组影响，不是依赖图或任务调度器。
- Claude 用户级安装与启用仅有历史验证；当前代码仍需在兼容宿主中重新校验、加载，并确认新会话自动打开。
- Claude 插件不聚合跨会话历史；Codex 在最近会话上限之前解析已绑定对话及其后代；未绑定时最多发现最近 100 个会话，接口仅返回该对话及其子代理。记录暂不可用时显示等待，不切换到其他对话。终端降级显示无法复现原生可视化面板。
- Codex 用量仅表示日志中可观测的累计 Token 与最近请求输入量；最近输入量不等于宿主实时上下文占用。未知字段会忽略，损坏行会跳过并提示。

Codex 日志格式不是稳定公共 API，兼容范围以本机已验证版本为准；此面板不具备多用户鉴权或远程监控能力。

## 参与贡献

欢迎提交 Issue 和 Pull Request。报告显示问题时，请提供宿主与引擎版本、复现步骤，以及去除敏感信息后的截图。原生界面和对话状态逻辑应遵循宿主 API 契约。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。

---

作者：[Zafer_Liu](https://www.zaferliu.me)。
