---
type: "Module"
id: agent_hub-main
title: "上游门户元数据与门面"
description: "存放 vendored 上游仓库 agent_hub-main 的根级清单与对外门面文件（package.json / VERSION / pnpm-lock / .gitignore / README / llms.txt / CHANGELOG / LICENSE），定义该 npm 包的发布边界、生态路由口径与版本线，是本仓库消费 Bitget Agent Hub 时唯一的离线事实来源。"
module_id: agent_hub-main
architectural_role: "上游元数据与门面层（vendored，只读）"
world_model_hints:
  - "属于 vendored 上游产物 agent_hub-main 的根级文件束：不含可执行逻辑（唯一代码在 agent_hub-main/installer/cli.mjs），但决定其发布面与运行下限"
  - "是「契约」层而非「实现」层：package.json 的 bin/engines/files 决定这个包对外长什么样，README/llms.txt 决定外部世界（人 + LLM）如何选择与调用生态包"
  - "本仓库没有任何代码 import 这些文件；耦合方式是「口径一致性」——Node 版本下限、包名、操作数口径必须与 backend/openspec 的说法对齐"
  - "改动本组文件属于修改上游文件，与 openspec 锁定的「消费 bitget-agent-hub、不得 fork 其源码」契约冲突"
upstream_modules:
  - module: "(外部) Bitget 官方仓库 Bitget-AI/agent_hub"
    note: "本文件束是该上游仓库根目录的 vendored 快照；上游通过 git + npm publish 更新，本仓库只读保留"
    confidence: extracted
  - module: agent_hub-main/installer
    note: "installer/cli.mjs 第 19–20 行以 createRequire 读取 ../package.json 的 version 作为 CLI_VERSION，package.json 是它的版本唯一真源；package.json 的 bin 字段把 CLI 暴露为 bitget-agent-installer"
    confidence: extracted
downstream_modules:
  - module: "(外部) npm registry / GitHub 仓库页 / 各 MCP 宿主"
    note: "package.json 的 files 白名单决定 npm tarball 内容；README 与 llms.txt 决定外部用户与 AI 选哪个包"
    confidence: extracted
  - module: backend/src
    note: "package.json engines.node >=20.0.0 与 backend/src/market_data/mcp_client.py:MIN_NODE_MAJOR = 20 是同一口径；config.py 默认以 npx 拉起 @bitget-ai/bitget-agent-mcp，其版本线由本组文档声明"
    confidence: inferred
  - module: openspec
    note: "openspec/specs/system-architecture/spec.md 规定「以依赖形式消费 bitget-agent-hub，不得 fork 修改其源码」，本组文件因此必须保持上游原样"
    confidence: extracted
retrieval_hints:
  - "Bitget Agent Hub 这个 npm 包发布出去都带哪些文件？bin 命令叫什么、Node 最低版本是多少？"
  - "这个上游包里 89 个操作、14 个 verb 的说法从哪来？和代码里的 109 个操作什么关系？"
  - "3.0.0 这个版本号是怎么定的、为什么安装器要和小一岁的 sdk/cli/mcp 同号？"
  - "⚠️ 如果你找的是安装器实际怎么装包、怎么部署技能（CLI 命令语义、受管包集合、回滚逻辑），不在这里——在 `agent_hub-main/installer`；本模块只描述这个包「对外长什么样」，不含执行逻辑。"
  - "⚠️ 如果你找的是上游能力契约的完整技术描述（catalog 结构、模块过滤、四道安全护栏、safeInvoke 信封），不在这里——在 `agent_hub-main/docs`；本模块只做入口级门面与口径。"
  - "⚠️ 如果你找的是本仓库自己的 `package.json` / 依赖锁定 / .gitignore 规约，不在这里——在仓库根 `__root/__files` 与 `frontend` / `backend` 模块；本模块的 package.json 属于 vendored 上游包，不受本仓库构建链路约束。"
  - "本文件组也叫「agent_hub 根文件束」「门户元数据」「upstream portal root files」，对应需求里的「Bitget Agent Hub 是什么、装哪个包、要求什么环境」。"
  - "架构归属句：任何关于上游包版本、发布文件白名单、Node 版本下限、生态包数量的新结论，必须写入本模块子文档并在 `__files_manifest.md` 的一处声明，不可散落在 installer 或 docs 子文档里重复维护。"
---

## Files

### 源代码路径

- `agent_hub-main/`（根级文件束，模块边界为该目录下的散落文件，不含 `installer/`、`docs/`、`assets/` 子目录）

### 本模块覆盖的散落文件

| 文件 | 性质 | 归属子文档 |
|------|------|-----------|
| `agent_hub-main/package.json` | npm 包清单（发布边界） | `__files_manifest.md` |
| `agent_hub-main/VERSION` | 版本号文本（人类可读镜像） | `__files_manifest.md` |
| `agent_hub-main/pnpm-lock.yaml` | 依赖锁（唯一 devDependency） | `__files_manifest.md` |
| `agent_hub-main/.gitignore` | 上游仓库忽略规约 | `__files_manifest.md` |
| `agent_hub-main/README.md` | 生态总入口（人类门面） | `__files_ecosystem.md` |
| `agent_hub-main/llms.txt` | 生态总入口（LLM 门面） | `__files_ecosystem.md` |
| `agent_hub-main/CHANGELOG.md` | 版本线与发布历史 | `__files_release.md` |
| `agent_hub-main/LICENSE` | MIT 许可与版权声明 | `__files_release.md` |

### 知识库文档

- `.codemaker/codeindex/agent_hub-main/__files/_overview.md`（本文件）
- `.codemaker/codeindex/agent_hub-main/__files/__files_manifest.md`
- `.codemaker/codeindex/agent_hub-main/__files/__files_ecosystem.md`
- `.codemaker/codeindex/agent_hub-main/__files/__files_release.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。本组文件为 JSON / Markdown / YAML 清单，无源码符号；该目录下唯一的可执行符号在 `agent_hub-main/installer/cli.mjs`（由 installer 模块文档负责）。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `__files_manifest.md` | 这个 npm 包对外长什么样：包名、bin、发布文件白名单、Node 引擎下限、pnpm 锁版本、仓库忽略规约，以及三处「文档与清单不一致」的既有漂移 | `PACKAGE_NAME`、`PACKAGE_VERSION`(3.0.0)、`ENGINE_NODE_MIN`(>=20.0.0)、`PUBLISH_FILES`、`BIN_NAME`、`PACKAGE_MANAGER`(pnpm@8.14.1)、`LOCKFILE_VERSION`(6.0) |
| `__files_ecosystem.md` | 生态路由门面：AI 宿主 → 该装哪个包的决策树、6 个包的单一职责、89 操作 / 14 verb 的对外口径、安全三件套（env-only / HMAC / read-only / paper-trading）与免责边界 | `VISIBLE_OPERATION_COUNT`(89)、`INTENT_VERB_COUNT`(14)、`CATALOG_OPERATION_COUNT`(109)、`MARKET_SKILL_COUNT`(5)、`strategy_order` 门控规则 |
| `__files_release.md` | 版本线决策与发布流程：为什么从 1.1.0 跳到 3.0.0、改名史、受管包集合为何排除 mcp/sdk、SemVer + Keep a Changelog 约定、MIT 许可与「不得 fork」的项目级约束 | `VERSION_LINE`(3.0.0)、`PREV_VERSION`(1.1.0)、`RENAMED_FROM`(bitget-hub)、`LICENSE`(MIT)、`NODE_MIN_HISTORY`(18→20) |

## 模块概述

`agent_hub-main` 是本仓库对 Bitget 官方 AI Agent 生态仓库（`Bitget-AI/agent_hub`）的 vendored 快照；本文件束是它的**根级元数据与对外门面**，解决的核心问题是：本仓库（Python 量化/交易系统）要「以依赖形式消费」上游能力，就必须有一个离线可信的地方回答「上游长什么样、要求什么环境、版本号对不上时以谁为准」。它不实现任何交易能力，而是定义这个 npm 包能被怎么发布、被谁选中、被哪个版本线绑定。

上游触发：内容变更完全由外部驱动——Bitget 官方仓库发新版本、`npm publish`、或本仓库同步上游快照时，这组文件才会变；本仓库的构建、测试、运行时都不会写入它们（`git ls-files` 确认全部为已跟踪的只读文件）。包内唯一的代码入口是 `agent_hub-main/installer/cli.mjs`，它反向读取本组的 `package.json` 作为版本真源（`cli.mjs:19-20` 以 `createRequire(import.meta.url)('../package.json')` 取 `version`），因此本组文件是安装器的数据上游。（来源: agent_hub-main/installer/cli.mjs）

下游影响：`package.json` 的 `files` 白名单直接决定 npm tarball 内容（`docs/`、`assets/`、`llms.txt` 都不在其中，只随 GitHub 分发）；`engines.node >= 20.0.0` 与 `backend/src/market_data/mcp_client.py` 的 `MIN_NODE_MAJOR = 20` 是同一口径，改动引擎下限而不改后端会造成「后端以为能跑、上游包直接拒绝启动」的运行时不兼容；`README.md` 与 `llms.txt` 是外部用户和 AI 助手选择包的唯一门面，但其「89 个操作」口径与仓库内其他层不同：`openspec` 的 roadmap 设计文档与 `docs/architecture.md` 用的是 catalog 口径 109（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）——**同一个仓库内 89/109 两套口径并存**是本组文件最需警惕的分叉点，引用时必须说清用的是「对外可见面」还是「目录全集」。

## 架构简析

本模块是**单一上游仓库的根目录切片**，内部结构按「机器可读清单 → 人类门面 → LLM 门面 → 历史与法务」四段组织，四段之间没有代码依赖，只有**口径依赖**：

分层结构（单行）：`package.json/VERSION（机器真源：发布面 + 版本号）` → `README.md / llms.txt（门面：选包与安全口径）` → `CHANGELOG.md（时间线：版本决策沿革）` → `LICENSE（法务边界）`

- **核心文件**：`package.json`（唯一机器真源，决定 bin/engines/files/version）、`README.md`（生态路由决策树，含安全三件套与免责声明）、`llms.txt`（同一批事实的 LLM 摄取版，含 FAQ 问答对）、`CHANGELOG.md`（解释 3.0.0 版本线如何与 UTA v3 家族对齐，是理解版本号的唯一上下文）。
- **关键数据流**：`CHANGELOG.md` 的版本决策 → `package.json.version` 与 `VERSION` 同步写入 → `cli.mjs` 在 `--version` / 帮助头中读出并显示。这条链上只有第一跳是人写的，后两跳必须人工同步，因此是本组的天然漂移点。
- **版本真源三分**：`package.json.version`（运行时真源，CLI 实际读取）、`VERSION`（人类/发布工具读的纯文本镜像）、`CHANGELOG.md` 首条（时间线事实）。三者同值 3.0.0，但只有 `package.json` 有运行时效果。
- **门面双份**：`README.md` 与 `llms.txt` 覆盖同一批事实且措辞不同（"5 core packages" vs "6 ecosystem packages"），构成刻意的「人类版 / 机器版」双门面，代价是双写同步责任。

**扩展点**：本模块对外只暴露一种 “扩展” 方式——新文件加入/移出根目录。新增文件需要同时回答三个问题：是否进 `files` 白名单（决定包体积与使用者体验）、是否需在 README/llms.txt 中被引用（决定是否存在引用死链）、是否属于上游原样（决定本仓库可不可改）。这三问均无代码可以替人回答，是本模块唯一且必须人工守住的边界。

## 上下游关系

| 方向 | 对象 | 关系 | confidence |
|------|------|------|-----------|
| 上游 | `Bitget-AI/agent_hub`（外部官方仓库） | 本组文件是该仓库根目录的只读快照，内容变更由上游发版驱动 | extracted |
| 上游 | `agent_hub-main/installer` | 消费 `package.json.version` 作为 `CLI_VERSION`，并依赖 `bin` 字段被 npm 暴露为 `bitget-agent-installer` | extracted |
| 下游 | npm registry / GitHub 仓库页 | `files` 白名单与 README 决定发布物与门面呈现 | extracted |
| 下游 | `backend/src`（`market_data/mcp_client.py`、`config.py`） | Node ≥20 口径、上游包版本线是后端启动 MCP 子进程的前提 | inferred |
| 下游 | `openspec`（`system-architecture` 规格） | 「不得 fork 上游源码」的规格直接约束本组文件的可改性 | extracted |
| 下游 | 外部 AI 宿主 / 终端用户 | README 决策树与 llms.txt FAQ 是选包与安全配置的权威入口 | inferred |

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/README.md`、`agent_hub-main/llms.txt`、`agent_hub-main/CHANGELOG.md`（原文已提炼，非完整转录）

## 跨模块与项目级约束（摘自 OpenSpec）

> 📋 本节内容来源于 OpenSpec：`openspec/specs/`（仅提炼约束口径，非完整转录）

- 本仓库 MUST 以依赖形式消费 `bitget-agent-hub`（`bitget-agent-sdk` / `bitget-agent-mcp` / `bitget-signal`），**不得 fork 修改其源码**；实现改动只允许发生在本仓库自身的 Python 侧适配层。（来源: openspec/specs/system-architecture/spec.md）
- 因上一条约束，`agent_hub-main/` 全目录（含本文件束）在本仓库中属于**只读 vendored 材料**：发现上游文档与本仓库事实冲突时，正确处置是「在本仓库知识库中记录冲突」而非「改上游文件对齐」。（来源: openspec/specs/system-architecture/spec.md）
- 该约束同时决定了本模块的存在理由：上游 npm 包是本仓库 AI Agent 通道（`bitget-agent-mcp`）与行情/新闻分析（`bitget-signal`）的来源，其版本线与能力口径必须可离线核对，否则 Python 侧无法确定「以哪个版本的工具面编码」。（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）
