---
type: "Module"
id: ".claude/commands"
title: "OpenSpec 命令入口"
description: "把 OpenSpec 变更（change）的立项、实现、修订、规范同步、归档全流程固化为一组 Claude Code 斜杠命令，保证 Agent 只按 CLI 给出的契约操作规划工件。"
module_id: ".claude/commands"
architectural_role: "研发流程层（Agent 命令入口）"
world_model_hints:
  - "属于研发工具层，不参与交易行情运行时；仅被人在会话中以斜杠命令触发"
  - "产物落在 openspec/changes 与 openspec/specs，不落在 backend/frontend 源码"
  - "与 .claude/skills/openspec-* 、.opencode/commands/opsx-* 是同一套流程的三种宿主载体"
upstream_modules:
  - module: "."            # 仓库根 CLAUDE.md / AGENTS.md 约定与开发者会话
    confidence: inferred
  - module: openspec       # 外部知识源：openspec CLI 与 changes/specs 目录（非 top_level_module）
    confidence: extracted
downstream_modules:
  - module: ".claude/skills"
    confidence: extracted
  - module: ".opencode/commands"
    confidence: inferred
  - module: "."            # 通过归档/同步回写 openspec/ 与 README 项目结构
    confidence: extracted
---

## Files

### 源代码路径

- `.claude/commands/`（6 个 Markdown 命令定义，全部位于 `opsx/` 子目录）
  - `opsx/propose.md` · `opsx/apply.md` · `opsx/update.md` · `opsx/sync.md` · `opsx/archive.md` · `opsx/explore.md`
- 本模块**无程序代码、无可执行符号**：Codemap 图内 `files=232 / symbols=4216` 均不含这些 `.md`，`search_code` 对本目录返回空结果。因此文档不列符号清单，只固化**命令契约与流程禁忌**。

### 知识库文档

- `.codemaker/codeindex/.claude/commands/_overview.md`（本文件）
- `.codemaker/codeindex/.claude/commands/.claude_commands_workflow.md`
- `.codemaker/codeindex/.claude/commands/.claude_commands_artifacts.md`
- `.codemaker/codeindex/.claude/commands/.claude_commands_cli_contract.md`

### 符号索引

- 由 **Codemap MCP** 实时提供；本模块为纯 Markdown 资产，Codemap 无符号可返回，检索请走 `search_knowledge`。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `.claude_commands_workflow.md` | 生命周期推进四命令（explore / propose / apply / archive）的职责边界、状态判定与输出契约 | `/opsx:apply`、`applyRequires`、`state: "blocked"`、`ARCHIVE_NAME_FORMAT` |
| `.claude_commands_artifacts.md` | 只改规划工件的两条命令（update / sync）：coherence 修订、delta spec 智能合并、幂等性 | `existingOutputPaths`、`ADDED/MODIFIED/REMOVED/RENAMED Requirements`、`openspec/specs/<capability>/spec.md` |
| `.claude_commands_cli_contract.md` | 六命令共用的 openspec CLI 契约：子命令白名单、status/instructions JSON 字段、`--store` 规则 | `openspec status --json`、`artifactPaths`、`contextFiles`、`--store <id>` |

## 模块概述

1. **业务定位**：本仓库是一个行情/交易系统，需求全部经 OpenSpec 的 change → spec 流程沉淀。本模块把"立项、实现、修订、规范同步、归档"五种人工动作固化成可复现的斜杠命令，使 Agent 在写代码前必须先读到 CLI 判定的工件状态，从而避免"边写代码边编造规划"造成需求与实现脱节。
2. **业务上游**：由开发者在 Claude Code 会话中以 `/opsx:xxx <change-name>` 主动触发（无定时器、无协议入口）；参数缺省时命令按"会话上下文推断 → 唯一活跃 change 自动选 → 否则必须弹选择框"的顺序取参。
3. **业务下游**：命令的写操作落在 `openspec/changes/**`（工件、`tasks.md` 勾选状态）与 `openspec/specs/<capability>/spec.md`（主规格），进而影响 `_catalog` 意义上的仓库文档权威源（`README` 项目结构以 `openspec/` 为权威，见 repo-hygiene 规格）；对行情/交易运行时代码只通过 `/opsx:apply` 间接触达。

## 架构简析

分层：**会话入口（命令 frontmatter + 输入解析）** → **状态解析（openspec CLI `list/status/instructions` 的 JSON）** → **写操作（工件文件编辑 / tasks 勾选 / `mv` 归档）** → **输出模板（Success / Paused / with warnings）**。

六文件按职责分三组：
- 推进组：`explore.md`（纯思考，禁止实现）、`propose.md`（建 change 并补齐 `applyRequires` 全部工件）、`apply.md`（按 tasks 循环实现并即时勾选）、`archive.md`（完成度校验 + 可选 sync + `mv` 到 `archive/`）。
- 修订组：`update.md`（只做 coherence 修订、禁止创建新工件）、`sync.md`（把 delta spec 智能合并进主 spec，不替换未提及内容）。
- 约定组：六文件顶部同构的 frontmatter（`name/description/allowed-tools: Bash(openspec:*)/category/tags`）与 `**Store selection**` 段——这组文字是**跨宿主镜像契约**，任一文件改动都需同步到 `.claude/skills/openspec-*` 与 `.opencode/commands/opsx-*`。

关键数据流：`openspec list --json` → 选定 change → `openspec status --change <name> --json`（取 `schemaName / applyRequires / artifactPaths.<id>.existingOutputPaths / planningHome.changesDir / changeRoot / actionContext`）→ 读 `contextFiles` → 编辑 → 回到 `status` 复检。所有路径**只允许**取自 CLI 输出，不允许硬编码。

## 上下游关系

> `extracted` = 文件文本内有直接引用证据；`inferred` = Agent 推断，需人工复核。

| 方向 | 模块/对象 | 关系 | confidence | 证据 |
|------|-----------|------|------------|------|
| 上游 | 开发者会话 / 仓库根约定（`CLAUDE.md`、`AGENTS.md`） | 以斜杠命令触发本模块 | inferred | 无自动装配入口，仅人工触发 |
| 上游 | `openspec` CLI（外部工具链） | 提供 `new change / status / instructions / list / show / validate / archive / doctor / context / store list` | extracted | 六个命令文件的 Steps 段逐一调用 |
| 下游 | `openspec/changes/**` | 写 `proposal.md / design.md / tasks.md / specs/**`，勾 `- [ ]` → `- [x]`，`mv` 到 `changes/archive/YYYY-MM-DD-<name>` | extracted | propose/apply/archive 的 Steps |
| 下游 | `openspec/specs/<capability>/spec.md` | sync / archive 触发主规格合并（131 个 capability 目录） | extracted | sync.md Step 4、archive.md Step 4 |
| 平级 | `.claude/skills/openspec-*`（6 个同名 Skill） | 命令正文与 Skill 正文一对一同源；`archive.md` 显式要求经 Task 工具调 `openspec-sync-specs` | extracted | archive.md Step 4 的 subagent 提示；两侧文件行数差 3~8 行 |
| 平级 | `.opencode/commands/opsx-*.md` | OpenCode 宿主镜像，差异仅在命令名分隔符（`/opsx:apply` ↔ `/opsx-apply`）与 frontmatter | extracted | `diff` 两文件仅命中前两类差异 |
| 平级 | `.claude/skills/code-index-builder` | 消费 `openspec/` 作为外部知识源，把本模块内容再沉淀进本知识库 | inferred | SKILL.md Step 0a-md 的 openspec 规则 |

## 变更风险总览

- **三宿主漂移**：一个流程改动必须同时落到 `.claude/commands/opsx/*`、`.claude/skills/openspec-*/SKILL.md`、`.opencode/commands/opsx-*.md`。只改一处 → 同一需求在 Claude Code 与 OpenCode 下行为不一致，且 workspace 的 `anti_patterns` 会把未同步的文件继续当作约束源。
- **权威源倒置**：命令若改成"允许猜 change 名 / 允许硬编码 artifact 名"，`openspec/changes/**` 会出现手写工件与 CLI schema 不一致，后续 `validate`/`archive` 直接失效。
- **主规格污染**：`sync.md` 的合并语义（delta 是 intent 而非整体替换）一旦被写成"整节替换"，`openspec/specs/**` 中未被 delta 提及的 scenario 会被静默删除，属于不可逆知识损失。
- 本模块 6 个文件在 git 上属 React/klinecharts-pro 转型前的 baseline 文档（`workspace.json` 的 `anti_patterns[*].why` 统一为 `baseline: Vue frontend + backend before React/klinecharts-pro pivot`）；对它们的改动没有后续提交背书，需人工复核。

> 📄 本节约束摘要来源于仓库内置文档：`.claude/skills/code-index-builder/SKILL.md`、`workspace.json` 的 `anti_patterns`；外部知识源 `openspec/`（`config.yaml` schema、`specs/change-roadmap/spec.md`、`specs/repo-hygiene/spec.md`）相关内容已分别融入上述子文档，逐条标注来源。
