---
type: "Module"
id: ".opencode/skills"
title: "OpenSpec 规格变更工作流技能"
description: "把 OpenSpec 规格驱动开发流程固化为六个可被 Agent 直接调用的动作技能，统一 change 从探索、立项、修订、实现到同步、归档的执行契约。"
module_id: ".opencode/skills"
architectural_role: "研发流程层（OpenSpec 工作流技能契约）"
world_model_hints:
  - "非业务运行时模块：不参与行情、风控、执行、前端渲染任何运行时链路"
  - "位于仓库工具链层，由 .opencode/commands/opsx-*.md 与用户自然语言触发"
  - "本模块只承载提示词契约；真正的产物落在 openspec/changes/ 与 openspec/specs/"
upstream_modules:
  - module: .opencode/commands
    confidence: extracted
  - module: .
    confidence: extracted
downstream_modules:
  - module: openspec/changes
    confidence: extracted
  - module: openspec/specs
    confidence: extracted
  - module: .claude/skills
    confidence: inferred
  - module: .codex/skills
    confidence: inferred
retrieval_hints:
  - "OpenCode 端的 OpenSpec 工作流技能都在哪个目录，包含哪几个动作？"
  - "一个需求从探索、立项、实现到归档，整体流程在哪里定义？"
  - "⚠️ 如果你找的是知识库生成器 code-index-builder 或 codemap-* 技能，不在这里，在 .claude/skills"
  - "⚠️ 如果你找的是斜杠命令入口本身，不在这里，在 .opencode/commands（冒号形式则在 .claude/commands/opsx/）"
  - "本模块也叫 OPSX / opsx 技能集，对应需求中的「规格驱动开发」「change 生命周期」"
  - "架构归属：新增流程动作必须建一个 `.opencode/skills/<动作名>/SKILL.md` 并同步另外两端与 `.opencode/commands/`，不得内嵌到已有技能正文"
---

## Files

### 源代码路径
- `.opencode/skills/`（6 个子目录，各含一个 `SKILL.md`：openspec-explore / openspec-propose / openspec-update-change / openspec-apply-change / openspec-sync-specs / openspec-archive-change）

### 知识库文档
- `.codemaker/codeindex/.opencode/skills/_overview.md`（本文件）
- `.codemaker/codeindex/.opencode/skills/skills_workflow_actions.md`
- `.codemaker/codeindex/.opencode/skills/skills_cli_contract.md`
- `.codemaker/codeindex/.opencode/skills/skills_guardrails.md`

### 符号索引
- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）
- ⚠️ 本模块为纯 Markdown 提示词资产，Codemap 中无对应代码符号；符号检索应转向 `.opencode/commands` 或 `openspec/` 文档，**不要在本目录下尝试符号查找**

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `skills_workflow_actions.md` | 六个动作技能各自的业务意图、change 生命周期状态流转、三条典型调用链 | `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `TASK_DONE_MARK` |
| `skills_cli_contract.md` | 与 openspec CLI 的接口契约：命令矩阵、JSON 字段、schema 驱动、路径解析、多端镜像关系 | `SCHEMA_NAME`, `STATUS_JSON_KEYS`, `APPLY_INSTRUCTIONS_KEYS`, `OPSX_COMMAND_SYNTAX` |
| `skills_guardrails.md` | 禁忌清单与边界约束、变更风险、设计决策与选型理由 | `FORBIDDEN_TARGETS`, `EXISTING_OUTPUT_PATHS`, `SYNC_IDEMPOTENT` |

## 模块概述

本模块把「一个需求从模糊想法走到并入主干规格」的全过程固化为六个可独立调用、可中断重入的动作技能，使 Agent 不必自造流程即可按仓库既定的 OpenSpec 规格驱动节奏推进；它解决的是"多人/多 Agent 并行开发时规格与实现脱节"的协作问题，而非任何交易业务问题。

上游：用户在 OpenCode 中以 `/opsx-<动作>` 斜杠命令或自然语言触发，命令面由同级的 `.opencode/commands/opsx-*.md` 提供；技能自身不定义触发时机之外的状态，所有进度判定都回落到 openspec CLI 的 JSON 输出；仓库 README 明确"功能先写 `openspec/changes/<change>/`（proposal → design → specs → tasks），实现后归档合并到 `openspec/specs/`"（来源: README.md）。

下游：技能执行后写入 `openspec/changes/<change>/` 与 `openspec/specs/<capability>/spec.md`，直接决定主规格（当前 131 个 capability、110 个 Purpose 仍为 `TBD - created by archiving`）的内容正确性；同时与本仓库另外两份镜像（`.claude/skills`、`.codex/skills`）保持同源，任一处单独修改都会造成三端流程话术不一致。

## 架构简析

**分层结构（单行）：** 命令层:`.opencode/commands/opsx-*.md` → 技能契约层:`.opencode/skills/openspec-*/SKILL.md` → 执行层:`openspec` CLI（`status`/`instructions`/`list`）→ 数据层:`openspec/changes/`、`openspec/specs/`（来源: README.md、openspec/config.yaml）

- **核心文件角色**：`openspec-propose`（一次成型立项，唯一的"创造 artifact"入口）、`openspec-update-change`（唯一允许修订既有 artifact 但不准创建新 artifact 的入口）、`openspec-apply-change`（唯一把 tasks 落到代码并勾选的入口）、`openspec-archive-change`（唯一的生命周期终点，并触发 sync）、`openspec-sync-specs`（唯一直接改写主干规格的入口）、`openspec-explore`（唯一"无工作流"的姿态型技能）。
- **关键数据流**：`openspec status --change <name> --json` → 技能解析 `schemaName`/`artifacts`/`artifactPaths` → `openspec instructions <artifact-id> --json` → 按 `template` 写 `resolvedOutputPath` → 复跑 `status` 确认 `done`。
- **状态机/生命周期**：artifact 状态 `blocked → ready → done`；实现阶段状态 `blocked`（缺 artifact）/ 正常 / `all_done`；change 终点为 `openspec/changes/archive/YYYY-MM-DD-<name>/`。设计上刻意**不做阶段锁**（fluid workflow）：`explore`/`update` 可在任意时刻调用，只有 artifact 的创建权被集中到 `propose` 与"继续"动作。
- **扩展点**：新增动作 = 新增一个 `SKILL.md` + 同级命令文件；新增工作流 = 在 `openspec/config.yaml` 换 `schema`，技能文本无需改（技能被禁止硬编码 artifact 名，见 `skills_cli_contract.md`）。

## 上下游关系

| 方向 | 对象 | 关系 | confidence |
|------|------|------|-----------|
| 上游 | `.opencode/commands/opsx-*.md` | 命令入口，正文与技能内容镜像；技能里的 `/opsx-<动作>` 引用必须与该目录文件名一一对应 | extracted |
| 上游 | `.`（仓库根 README.md） | 声明 OpenSpec 规格驱动流程为本仓库唯一开发流程（来源: README.md） | extracted |
| 上游 | `openspec/config.yaml` | 提供 `schema: spec-driven`，决定技能可用的 artifact 序列 | extracted |
| 上游 | `openspec/changes/` | 技能的实际输入：change 目录与 `.openspec.yaml` | extracted |
| 下游 | `openspec/specs/` | `sync-specs` 直接改写主规格；改错即污染全部 131 个 capability 规格 | extracted |
| 下游 | `.claude/skills`、`.codex/skills` | 三端镜像同源，仅斜杠命令语法不同；单端改动会造成流程话术漂移 | inferred |

> ⚠️ `workspace.json` 的 `cross_module_hints` 中出现的 `backend → .opencode/skills`、`backend/src → .opencode/skills`、`frontend → .opencode/skills` 等条目经 grep 复核**无实际引用**（`backend/`、`frontend/` 下无 `.opencode` 字样），属扫描器路径清单产生的伪关系，勿据此建立依赖。

## 变更风险总览

- 修改任一 `SKILL.md` 的动作边界（例如让 `apply` 自动补建缺失 artifact）会绕过 schema 的 artifact 依赖顺序，导致 tasks 与 spec 描述不一致；`openspec/specs/change-roadmap` 明确要求每个 change 独立立项、不越界实现其它 change 的能力（来源: openspec/specs/change-roadmap/spec.md）。
- 本模块**不在任何自动门禁覆盖范围内**：CI（`.github/workflows/ci.yml`）与 pre-commit 的 hooks 只对 `backend/`（ruff）与 `frontend/`（Biome）生效，`.opencode/` 下的改动不会被任何检查捕获，必须依赖人工/Agent 自查。
- 这些文件由 openspec CLI 生成（六个文件 frontmatter 均为 `metadata.generatedBy: "1.6.0"`、`author: openspec`），手工编辑会在下次 CLI 更新时被覆盖，所有本地化改动都应视为"待上游合并"的临时补丁。

## 附：仓库内置文档摘要

- README.md 明确本仓库以 OpenSpec 规格驱动开发：功能先写 `openspec/changes/<change>/`（proposal → design → specs → tasks），实现后归档合并到 `openspec/specs/`；规格与设计文档的权威来源为 `openspec/`，README 的项目结构小节只允许列真实存在的目录（来源: README.md、openspec/specs/repo-hygiene/spec.md）。
- `openspec/config.yaml` 当前仅声明 `schema: spec-driven`，`context` 与 `rules` 全部为注释示例（未启用）；因此技能拿到的 `context`/`rules` 均为空，产物内容规范完全由 schema 内建规则约束（来源: openspec/config.yaml）。
- 已归档 change 的元数据文件形如 `schema: spec-driven` + `created: 2026-07-26`，归档目录名为 `YYYY-MM-DD-<change-name>`，与技能中"用当前日期生成目标名、保留 `.openspec.yaml`"的约定一致（来源: openspec/changes/archive/2026-07-26-ai-agent-core/.openspec.yaml）。

> 📄 本节内容来源于仓库内置文档：`README.md`、`openspec/config.yaml`、`openspec/changes/archive/2026-07-26-ai-agent-core/.openspec.yaml`（原文已提炼，非完整转录）
