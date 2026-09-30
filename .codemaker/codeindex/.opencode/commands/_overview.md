---
type: "Module"
id: ".opencode/commands"
title: "OpenCode 变更流程命令"
description: "把 OpenSpec 变更（change）的探索、立项、实现、修订、规范同步、归档六种人工动作，固化成 OpenCode 宿主下的 /opsx-* 斜杠命令，约束代理只按 openspec CLI 给出的契约操作规划工件。"
module_id: ".opencode/commands"
architectural_role: "研发流程层（OpenCode 命令入口）"
world_model_hints:
  - "属于研发工具/规程层，不在行情与交易的运行时链路上；只能由人在 OpenCode 会话里以斜杠命令触发"
  - "写操作只落在 openspec/changes/** 与 openspec/specs/**，绝不落在 backend/ 或 frontend/ 源码（除 /opsx-apply 显式实现任务）"
  - "与 .claude/commands/opsx/*、.claude/skills/openspec-*、.opencode/skills/openspec-* 是同一套流程的多宿主镜像，改动必须四处同步"
  - "本模块是纯 Markdown 提示词资产，Codemap 符号图内无可检索符号，检索请走 search_knowledge"
upstream_modules:
  - module: "."            # 开发者会话 + 仓库根 AGENTS.md 约定
    confidence: inferred
  - module: openspec       # 外部知识源与 CLI（非 top_level_module）
    confidence: extracted
downstream_modules:
  - module: ".opencode/skills"
    confidence: extracted
  - module: ".claude/commands"
    confidence: extracted
  - module: ".claude/skills"
    confidence: extracted
---

## Files

### 源代码路径

- `.opencode/commands/`（6 个 Markdown 命令定义，平铺于本目录，无子目录）
  - `opsx-explore.md`（171 行）· `opsx-propose.md`（106 行）· `opsx-apply.md`（152 行）· `opsx-update.md`（78 行）· `opsx-sync.md`（140 行）· `opsx-archive.md`（157 行）
- 宿主配置：仓库根 `opencode.json`（只声明 mcp/plugin，不含命令注册表）→ 命令按 `.opencode/commands/<name>.md` 文件名约定被发现，命令名即 `/opsx-<name>`
- 本模块**无程序代码**：Codemap 对本目录只返回文档节点，`search_code` 取不到函数符号，因此本文档不列符号清单，只固化**命令契约、状态判定与流程禁忌**

### 知识库文档

- `.codemaker/codeindex/.opencode/commands/_overview.md`（本文件）
- `.codemaker/codeindex/.opencode/commands/.opencode_commands_workflow.md`
- `.codemaker/codeindex/.opencode/commands/.opencode_commands_artifacts.md`
- `.codemaker/codeindex/.opencode/commands/.opencode_commands_cli_contract.md`

### 符号索引

- 由 **Codemap MCP** 实时提供；本模块为纯 Markdown 资产，无符号可返回

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `.opencode_commands_workflow.md` | 生命周期推进四命令（explore / propose / apply / archive）的职责边界、取参与状态判定、勾选与归档写入契约 | `state: "blocked"`、`all_done`、`- [ ]` → `- [x]`、`YYYY-MM-DD-<change-name>`、`/opsx-continue`（悬空引用） |
| `.opencode_commands_artifacts.md` | 只动规划工件的两条命令（update / sync）：coherence 修订边界、delta spec 智能合并、幂等性 | `existingOutputPaths`、`ADDED/MODIFIED/REMOVED/RENAMED Requirements`、`openspec/specs/<capability>/spec.md` |
| `.opencode_commands_cli_contract.md` | 六命令共用的 openspec CLI 契约、JSON 字段白名单、`--store` 规则、跨宿主镜像差异与工具名耦合 | `openspec status --json`、`artifactPaths`、`contextFiles`、`--store <id>`、`AskUserQuestion`、`allowed-tools` |

## 模块概述

1. **业务定位**：本仓库（行情/交易系统）的每一个需求都要先经 OpenSpec 变成 change（proposal / design / tasks / specs delta），实现完再合并回主规格；本模块解决的不是"写代码"，而是**防止代理跳过规格、边写边编**——它把"探索、立项、实现、修订、同步规格、归档"六种动作固化成可复现命令，强制代理先读 `openspec` CLI 判定的工件状态再动手，从流程上保证 `openspec/specs/**`（131 个 capability）与本仓库实现不至于长期背离。（来源: openspec/config.yaml；`## Purpose` 权威源规则见 openspec/specs/repo-hygiene/spec.md）
2. **业务上游**：仅由开发者在 OpenCode 会话中以 `/opsx-<name> [change-name]` 主动触发，无定时器、无协议路由。change 名缺省时各命令按固定优先级取参：`会话上下文可推断 → 唯一活跃 change 自动选（仅 apply）→ 否则必须弹选择框`；`archive`/`sync`/`update` 三命令明确禁止猜测或自动选中，必须让人选。（来源: openspec/changes/ 当前无活跃 change、仅 archive/ 一层，`openspec list --json` 返回空数组，选择框必然落空并由命令自行提示）
3. **业务下游**：写操作落在 `openspec/changes/<name>/**`（新建 change 目录、`.openspec.yaml`、proposal/design/tasks/specs delta、tasks 勾选状态）与 `openspec/specs/<capability>/spec.md`（主规格合并）；再通过归档 `mv` 影响 `openspec/changes/archive/YYYY-MM-DD-<name>/`（已有 81 个归档条目）。对交易运行时代码只有 `/opsx-apply` 在实现任务时才间接触达 `backend/`、`frontend/`。（来源: openspec/changes/archive/）

## 架构简析

**分层结构（单行）：** 会话入口:`.opencode/commands/opsx-*.md`（frontmatter `description` + Input 取参规则）→ 状态层:`openspec list|status|instructions --json`（外部 CLI）→ 写操作层:`openspec/changes/**`、`openspec/specs/**` 的文件编辑与 `mv` → 输出层:命令内置的 Success / Paused / With-warnings 模板。

六文件按职责分三组：

- **推进组**：`explore`（纯思考，禁止写码，可读码、可建工件）、`propose`（建 change 并补齐 `applyRequires` 要求的全部工件）、`apply`（按 tasks 循环实现并逐条勾选）、`archive`（完成度校验 + 可选 sync + `mv` 归档）。
- **修订组**：`update`（只做 coherence 修订，禁止创建新工件、禁止改代码）、`sync`（把 delta spec 智能合并进主 spec，保留 delta 未提及内容）。
- **约定组**：六文件顶段同构的 `**Store selection**` 段（逐字重复 6 次）与统一的 `openspec status --change "<name>" --json` 取径——这组文字是**跨宿主镜像契约**，任一文件改动都需同步到 `.opencode/skills/openspec-*`、`.claude/commands/opsx/*`、`.claude/skills/openspec-*` 三处。

**核心数据流**：`openspec list --json` → 选定 change → `openspec status --change "<name>" --json`（取 `schemaName / applyRequires / artifactPaths.<id>.existingOutputPaths / planningHome.changesDir / changeRoot / actionContext`）→ 读 `contextFiles` 或 `existingOutputPaths` 指向的文件 → 编辑 → 回到 `status` 复检。所有路径**只允许**取自 CLI 输出，不允许按仓库相对路径硬编码。

**扩展点**：新增动作=在这个目录新增一个 `opsx-<verb>.md`（文件名即命令名），但必须同时提供配套 skill 与 claude 版命令，且不得新造 CLI 未返回的工件名。

## 上下游关系

> `extracted` = 命令正文内有直接引用证据；`inferred` = Agent 推断，需人工复核。

| 方向 | 模块/对象 | 关系 | confidence | 证据 |
|------|-----------|------|------------|------|
| 上游 | 开发者会话 + 仓库根 `AGENTS.md` | 以 `/opsx-*` 触发本模块 | inferred | 无自动装配；`opencode.json` 不注册命令 |
| 上游 | `openspec` CLI（外部工具链，v1.6.0） | 提供 `new change / status / instructions / list / show / validate / archive / doctor / context / store list` | extracted | 六个命令文件 Steps 段逐一调用 |
| 下游 | `openspec/changes/**` | 建 change、写工件、勾 `- [ ]` → `- [x]`、`mv` 到 `archive/YYYY-MM-DD-<name>` | extracted | propose / apply / archive 的 Steps |
| 下游 | `openspec/specs/<capability>/spec.md` | sync / archive 的主规格合并目标（131 个 capability） | extracted | sync Step 4、archive Step 4 |
| 平级镜像 | `.opencode/skills/openspec-*`（6 个同名 skill） | 同套流程的技能载体；正文差异 16~148 行不等，`archive` 显式要求回调 `openspec-sync-specs` | extracted | archive.md L62/L156；`diff` 行数统计 |
| 平级镜像 | `.claude/commands/opsx/*`（6 个同名命令） | Claude Code 版；差异集中在 frontmatter（多 `name/allowed-tools/category/tags`）与命令名分隔符 `/opsx:apply` ↔ `/opsx-apply` | extracted | `diff` 每个文件仅命中这两类差异 |
| 平级镜像 | `.claude/skills/openspec-*` | 第四份拷贝，约束同样适用 | inferred | 目录同名同数量 |

## 变更风险总览

- **四宿主漂移（最高频风险）**：同一流程存在 4 份文本。只改 `.opencode/commands` 一处 → 同一需求在 OpenCode 与 Claude Code 下行为不一致；`workspace.json` 的 `anti_patterns` 已把 4 处文本全部采集为约束源（本目录命中 72 条 `do_not`），不同步会让后续代理读到互相矛盾的约束。
- **权威源倒置**：命令若被改成"允许猜 change 名 / 允许硬编码 `proposal.md`、`tasks` 这类工件名 / 允许自行拼 `openspec/changes/<name>` 路径"，产出物会与 schema 判定脱节，`openspec validate` 与归档直接失效；自定义 schema（非 `spec-driven`）将无法不改代码即用。
- **主规格污染（不可逆知识损失）**：`opsx-sync` 的语义是"delta 表达 intent，不是整体替换"。若实现成整节替换，`openspec/specs/**` 中未被 delta 提及的 scenario 会被静默删除。仓库为此专门跑过一个清理 change，说明漂移后果真实存在。（来源: openspec/changes/archive/2026-09-20-spec-drift-cleanup/proposal.md）
- **归档绕过 CLI 导致规格不更新**：`openspec archive` 本身会"更新主规格"，而 `/opsx-archive` 选择以 `mkdir -p` + `mv` 自行归档、把主规格合并交给 `openspec-sync-specs`。用户选 "Archive without syncing" 时 change 消失出活跃列表，但主规格永远收不到合并 → 本模块的这条分工是最容易被误改的点，详见 `.opencode_commands_workflow.md` 的设计决策表。
- **悬空命令引用**：`opsx-apply.md` L44 与 `opsx-update.md` L49/L61/L69/L76 提示用户走 `/opsx-continue`，L78 提示 `/opsx-new`，但这两个命令在 `.opencode/commands`、`.claude/commands/opsx` 中**都不存在**。照做会得到"未知命令"；改动本模块时不要把这类提示扩散到更多文件。
- **宿主工具名耦合**：正文写的是 Claude Code 的工具名（`AskUserQuestion` / `TodoWrite` / `Task tool (subagent_type: "general-purpose")` / `Skill tool`），共 9 处。OpenCode 宿主不保证同名工具存在，执行时会退化为"该问的没问、该并行的没并行"。
- 这 6 个文件在 git 上属 React/klinecharts-pro 转型前的 baseline 文档（`workspace.json.anti_patterns[*].why` 统一为 `baseline: Vue frontend + backend before React/klinecharts-pro pivot`），改动无后续提交背书，需人工复核。

> 📋 本节引用了 OpenSpec 外部知识源（`openspec/config.yaml`、`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/`、`openspec/changes/archive/`），仅提炼与流程契约相关的条款，非完整转录。
> 📄 本节内容来源于仓库内置文档：`workspace.json`（`anti_patterns` / `top_level_modules`）与 `.opencode/commands/*.md` 原文（已提炼，未复制正文）。
