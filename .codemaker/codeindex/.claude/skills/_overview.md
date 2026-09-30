---
type: "Module"
id: .claude/skills
title: "Agent 技能定义层"
description: "把仓库的编码代理（Claude Code / opencode）能力沉淀为可复用的技能定义：知识库构建、Codemap 图检索、OpenSpec 变更工作流三族技能，决定代理按什么规程干活。"
module_id: .claude/skills
architectural_role: "Agent 技能定义层"
world_model_hints:
  - "属于工具/规程层，不在运行时业务链路中；由用户在会话中显式触发（slash 命令或 skill 名）"
  - "产物影响的是人和代理下次怎么改这个仓库，而不是交易系统的运行时行为"
upstream_modules:
  - module: .claude/commands
    confidence: extracted
  - module: .opencode/skills
    confidence: extracted
downstream_modules:
  - module: .codemaker/codeindex
    confidence: extracted
  - module: agent_hub-main
    confidence: inferred
---

## Files

### 源代码路径
- `.claude/skills/`（本模块，18 个源文件：11 个 `SKILL.md`、6 个 Python 脚本、1 个 `requirements.txt`）
- 镜像/配套目录：`.opencode/skills/`（同一批 OpenSpec 技能的 opencode 版本）
- 命令入口：`.claude/commands/opsx/`、`.opencode/commands/`

### 知识库文档
- `.codemaker/codeindex/.claude/skills/_overview.md`（本文件）
- `.codemaker/codeindex/.claude/skills/skills_kb_builder.md`
- `.codemaker/codeindex/.claude/skills/skills_kb_scripts.md`
- `.codemaker/codeindex/.claude/skills/skills_codemap.md`
- `.codemaker/codeindex/.claude/skills/skills_openspec.md`

### 符号索引
- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `skills_kb_builder.md` | 知识库构建规程：Step 流水线、产物结构、frontmatter 契约、增量更新、质量门槛 | `code-index-builder`, `_overview.md`, `kb-config.json`, `_concept_index.md` |
| `skills_kb_scripts.md` | 脚本工具链：索引生成、格式校验、差异扫描、签名提取、词频 desc、占位存根 | `build_index.py`, `validate.py`, `diff_kb.py`, `extract_signatures.py`, `generate_desc.py`, `scan_repo.py` |
| `skills_codemap.md` | 四个 Codemap 图检索姿势：探索、调试、影响面分析、Cypher 聚合查询 | `codemap-exploring`, `codemap-debugging`, `codemap-impact-analysis`, `codemap-cypher-query` |
| `skills_openspec.md` | OpenSpec 变更生命周期六技能 + `opsx` 命令镜像与命名空间差异 | `openspec-propose`, `openspec-apply-change`, `openspec-sync-specs`, `openspec-archive-change` |

## 文件组成与子文档归属

> 全部本模块源文件均被覆盖（覆盖率 18/18）；新增技能文件时须同步登记到此表。

| 源文件 | 归属子文档 |
|--------|-----------|
| `.claude/skills/code-index-builder/SKILL.md` | `skills_kb_builder.md`（规程）+ `skills_kb_scripts.md`（脚本契约） |
| `.claude/skills/code-index-builder/scripts/build_index.py` | `skills_kb_scripts.md` |
| `.claude/skills/code-index-builder/scripts/validate.py` | `skills_kb_scripts.md` |
| `.claude/skills/code-index-builder/scripts/diff_kb.py` | `skills_kb_scripts.md` |
| `.claude/skills/code-index-builder/scripts/extract_signatures.py` | `skills_kb_scripts.md` |
| `.claude/skills/code-index-builder/scripts/generate_desc.py` | `skills_kb_scripts.md` |
| `.claude/skills/code-index-builder/scripts/scan_repo.py` | `skills_kb_scripts.md`（存根说明） |
| `.claude/skills/code-index-builder/requirements.txt` | `skills_kb_scripts.md`（依赖钉版） |
| `.claude/skills/codemap-exploring/SKILL.md` | `skills_codemap.md` |
| `.claude/skills/codemap-debugging/SKILL.md` | `skills_codemap.md` |
| `.claude/skills/codemap-impact-analysis/SKILL.md` | `skills_codemap.md` |
| `.claude/skills/codemap-cypher-query/SKILL.md` | `skills_codemap.md` |
| `.claude/skills/openspec-explore/SKILL.md` | `skills_openspec.md` |
| `.claude/skills/openspec-propose/SKILL.md` | `skills_openspec.md` |
| `.claude/skills/openspec-apply-change/SKILL.md` | `skills_openspec.md` |
| `.claude/skills/openspec-update-change/SKILL.md` | `skills_openspec.md` |
| `.claude/skills/openspec-sync-specs/SKILL.md` | `skills_openspec.md` |
| `.claude/skills/openspec-archive-change/SKILL.md` | `skills_openspec.md` |
| —（本模块无 `README.md` / `docs/`；11 个 `SKILL.md` 自身即内置文档，已提炼入各子文档「附：内置文档摘要」） | — |

## 模块概述

本模块的业务意图是**把"代理怎么改这个仓库"变成可执行、可校验的规程**：它不含任何交易业务逻辑，而是定义三条工作流——① 用 `code-index-builder` 把仓库知识沉淀成 `.codemaker/codeindex/` 知识库；② 用四个 `codemap-*` 技能规定"先图检索、再读文件、后编辑"的代码理解姿势；③ 用六个 `openspec-*` 技能规定"规格先行的变更生命周期（propose → apply → sync → archive）"，从而让每次需求实现都有统一的上下文来源与留痕（来源: `.claude/skills/code-index-builder/SKILL.md`、`.claude/skills/openspec-propose/SKILL.md`）。

上游由**用户会话显式触发**：`.claude/commands/opsx/*.md` 与 `.opencode/commands/opsx-*.md` 是斜杠命令入口，运行时转发到同名目录下的 `SKILL.md`；skill 正文的 frontmatter `description`（含"【调用时机】/【排除边界】"触发词）决定模型何时自动加载该技能。技能内部再反向调用外部工具链：Codemap MCP（`search_code`/`query_cypher`）与 `openspec` CLI（`openspec new change` / `status` / `archive`）（来源: `openspec/config.yaml`）。

下游影响三条链路，且全部是"高风险改动"：① 改动 `code-index-builder` 的 frontmatter/章节契约，会同时打破 `validate.py` 的校验与 `search_knowledge` 的召回，使**整个仓库的知识库检索失效**；② 改动 `codemap-*` 技能的工作流顺序，会让代理退化成"盲目 Grep + 直接编辑"，重引入本项目已明确禁止的定位方式（`AGENTS.md` 要求优先使用 Codemap MCP 工具）；③ 改动 `openspec-*` 技能的产物路径推导规则，会使已归档 change 与 `openspec/specs/*/spec.md` 失联，`openspec archive` 之后规格漂移（来源: `openspec/specs/change-roadmap/spec.md`）。

## 架构简析

> 对当前模块内部结构进行简要分析，回答"这个模块是怎么组织的"。

**分层结构（单行格式）：** 会话触发层:`.claude/commands/opsx/*.md` → 技能定义层:`.claude/skills/<skill>/SKILL.md` → 工具执行层:`.claude/skills/code-index-builder/scripts/*.py` + Codemap MCP + `openspec` CLI

模块按**三族能力 + 两种来源**组织，这是本模块最重要的结构事实：

- **按能力分三族**：知识库构建族（`code-index-builder`，唯一带可执行脚本的一族）、Codemap 检索族（`codemap-exploring` / `codemap-debugging` / `codemap-impact-analysis` / `codemap-cypher-query`，均为纯工作流文档）、OpenSpec 变更族（`openspec-propose` / `openspec-explore` / `openspec-apply-change` / `openspec-update-change` / `openspec-sync-specs` / `openspec-archive-change`，均是 `openspec` CLI 的薄封装规程）。共 11 个技能条目、4 个子文档承接。
- **按来源分两类，且入库性不同**：`openspec-*` 六个技能由 `openspec` CLI 生成（frontmatter 含 `generatedBy: 1.6.0`、`allowed-tools: Bash(openspec:*)`）并被 git 跟踪；`code-index-builder` 与四个 `codemap-*` 技能由 Codemap 工具链下发，被 `.gitignore` 的 `.claude/skills/codemap-*/`、`.claude/skills/code-index-*/` 规则忽略（`git status --ignored` 确认为 `!!` 状态），不入版本库。
- **核心文件角色**：`code-index-builder/SKILL.md`（1042 行，唯一定义了产物契约与 10 步流水线的主规程）、`code-index-builder/scripts/validate.py`（把文档契约变成可执行校验）、`scripts/diff_kb.py`（增量更新与差异报告）、四个 `codemap-*/SKILL.md`（工具使用纪律）。

**关键数据流**：会话意图 → 斜杠命令/skill 触发 → `code-index-builder` 十步流水线（Step 0-codemap 探测 → 0-config/0a/0a-md/0b 预处理 → 1 读 workspace.json → 5 逐模块产出 → 6 全局索引 → 7 校验 → 8 自检 → 9 写 `kb-config.json` → 10 增强词义索引）→ 落盘 `.codemaker/codeindex/**`；Codemap 不可用时（`get_graph_stats` 失败或 `files=0`）流水线必须**中止**而非离线降级。

**扩展点**：新增技能只需新建 `<skill-name>/SKILL.md` 并写清 `description` 触发条件与排除边界；但涉及本仓库定制规程时，按 `.gitignore` 现状应写入 `.codemaker/rules/` 或 `AGENTS.md`，而不是塞进被忽略的下发技能目录。

## 上下游关系

> `extracted` = 静态分析可信；`inferred` = Agent 推断待复核

| 方向 | 模块/系统 | confidence | 说明 |
|------|----------|-----------|------|
| 上游 | `.claude/commands/opsx/` | extracted | 斜杠命令 `/opsx:propose` 等转发到本模块同名技能 |
| 上游 | `.opencode/commands/` | extracted | opencode 侧 `/opsx-propose` 等命令的镜像入口 |
| 上游 | 用户会话 | extracted | skill 的 `description` 触发条件决定自动加载 |
| 下游 | `.codemaker/codeindex/` | extracted | `code-index-builder` 的唯一产物根，被 `search_knowledge` 检索 |
| 下游 | `.codemaker/codemap/` | extracted | `workspace.json` 由 Codemap 预生成，本模块 Step 1 消费 |
| 下游 | `openspec/` | extracted | `openspec-*` 技能直接读写 `openspec/specs/`、`openspec/changes/` |
| 依附 | Codemap MCP | extracted | 四个 `codemap-*` 技能的前置依赖；不可用则技能不可执行 |
| 依附 | `openspec` CLI | extracted | 六个 `openspec-*` 技能的 `allowed-tools` 前置依赖 |
| 同构 | `.opencode/skills/` | extracted | OpenSpec 六技能的镜像副本，内容仅命令命名空间不同 |
| 同名 | `agent_hub-main`（`bitget-signal` 技能包） | inferred | 另一套"skill"概念（行情分析技能），与本模块无代码关系 |

> 📄 本节部分内容来源于仓库内置文档：`.claude/skills/*/SKILL.md`（原文已提炼，非完整转录）
> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/change-roadmap/spec.md`、`openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`（仅提炼相关约束，非完整规范）
