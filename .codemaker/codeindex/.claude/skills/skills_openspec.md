---
type: "Fragment"
id: .claude/skills/openspec
title: "Agent 技能定义层 / OpenSpec 变更工作流"
description: "一个需求从提案到归档要经过哪六个技能、哪些动作被严格禁止？"
parent: /.claude/skills/_overview.md
fragment: openspec
entity_names:
  constants:
    - name: OPENSPEC_SCHEMA
      value: "spec-driven"
      source: openspec/config.yaml
    - name: OPENSPEC_SKILL_GENERATED_BY
      value: "1.6.0"
      source: .claude/skills/openspec-propose/SKILL.md
    - name: OPENSPEC_ALLOWED_TOOLS
      value: "Bash(openspec:*)"
      source: .claude/skills/openspec-apply-change/SKILL.md
    - name: OPENSPEC_ARTIFACT_TRIPLE
      value: "proposal.md, design.md, tasks.md"
      source: .claude/skills/openspec-propose/SKILL.md
    - name: OPENSPEC_MAIN_SPEC_PATH
      value: "openspec/specs/<capability>/spec.md"
      source: .claude/skills/openspec-sync-specs/SKILL.md
    - name: OPENSPEC_ARCHIVE_PATH_PATTERN
      value: "openspec/changes/archive/<YYYY-MM-DD>-<change-name>/"
      source: openspec/changes/archive/
    - name: OPENSPEC_DELTA_SECTIONS
      value: "ADDED, MODIFIED, REMOVED, RENAMED"
      source: .claude/skills/openspec-sync-specs/SKILL.md
    - name: OPENSPEC_TASK_UNCHECKED_MARK
      value: "- [ ]"
      source: .claude/skills/openspec-archive-change/SKILL.md
    - name: OPENSPEC_STORE_FLAG
      value: "--store <id>（经 `openspec store list --json` 发现）"
      source: .claude/skills/openspec-archive-change/SKILL.md
retrieval_hints:
  - "新需求怎么立项、生成 proposal/design/tasks？"
  - "实现完代码后怎么把 delta 规格并回主规格、怎么归档？"
  - "探索模式（explore）能不能直接写代码？"
  - "⚠️ 如果你说的是 bitget-signal 的「行情分析 skill」（5 个免 key 技能，由 agent_hub 安装器部署），不在这里，在 agent_hub-main 模块"
  - "⚠️ 如果你要找的是知识库产物（.codemaker/codeindex），不在这里，在 skills_kb_builder.md"
  - "本族技能也叫「opsx 命令 / spec-driven 变更流程 / 立项-实现-归档」"
architectural_role: "Agent 技能定义层的规格驱动变更纪律：openspec CLI 的六个流程封装"
---

## 业务意图

本仓库的一切能力都以 `openspec/` 为**唯一权威规格来源**（README 甚至被要求不得列出不存在的目录，"规格与设计文档的权威来源为 openspec/"）。这六个技能的作用是把"规格先行"落成一条可执行流水线：**先立项写规格 → 再按 tasks 实现 → 再把 delta 并回主规格 → 最后归档留痕**，从而保证代码与规格不脱节，也让后续需求能靠 `openspec/specs/*` 与 `openspec/changes/archive/*` 追溯历史决策（来源: `openspec/specs/repo-hygiene/spec.md`）。

## 对外接口（对 CLI 与命令的契约）

| 技能 | 阶段 | 关键外部动作 | 业务说明 | 入口符号 |
|------|------|------------|---------|---------|
| `openspec-explore` | 立项前 | 只读：读码/搜索/可视化 | 思考伙伴模式，**禁止实现代码**；允许产出 OpenSpec 工件 | `openspec-explore/SKILL.md` |
| `openspec-propose` | 立项 | `openspec new change "<kebab-name>"` → `openspec status --change <name> --json` | 一次性生成 proposal/design/tasks 三工件 | 同上 |
| `openspec-apply-change` | 实现 | `openspec status` → 读 `contextFiles` → 逐 task 实现并勾选 | 按 tasks 推进编码，遇阻塞即停 | 同上 |
| `openspec-update-change` | 修订计划 | 只编辑 `artifactPaths.<id>.existingOutputPaths` | 修订已有工件保持相互一致，**不推进前沿** | 同上 |
| `openspec-sync-specs` | 并规格 | 读 delta spec → 直接编辑 `openspec/specs/<capability>/spec.md` | 把 delta（ADDED/MODIFIED/REMOVED/RENAMED）智能合并进主规格 | 同上 |
| `openspec-archive-change` | 归档 | `openspec archive` | 完成度检查 → 评估 delta 同步状态 → 归档 | 同上 |

> Store 契约（六个技能共有）：若工作位于某个 **store**（本机注册的独立 OpenSpec 仓库），先 `openspec store list --json` 取 id，再在读写规格/变更的命令上传 `--store <id>`：`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`；**其余命令不接受该 flag**。无 store 时命令作用于最近的本地 `openspec/` 根（来源: `.claude/skills/openspec-*/SKILL.md`）。

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `OPENSPEC_SCHEMA` | `spec-driven` | `openspec/config.yaml` | 当前活动 schema；工件 id 与路径由 CLI 输出决定 | 自定义 schema 必须零改动可用 |
| `OPENSPEC_ARTIFACT_TRIPLE` | `proposal.md, design.md, tasks.md` | `openspec-propose/SKILL.md` | 立项三件套：做什么&为什么 / 怎么做 / 实现步骤 | propose 的标准产物 |
| `OPENSPEC_ALLOWED_TOOLS` | `Bash(openspec:*)` | 六个技能 frontmatter | 技能只被授权调用 openspec CLI | 权限最小化 |
| `OPENSPEC_MAIN_SPEC_PATH` | `openspec/specs/<capability>/spec.md` | `openspec-sync-specs/SKILL.md` | 主规格落点（capability = 规格目录名，如 `repo-hygiene`） | sync 的唯一写入目标 |
| `OPENSPEC_DELTA_SECTIONS` | `ADDED/MODIFIED/REMOVED/RENAMED` | 同上 | delta 规格四类段落；RENAMED 用 FROM:/TO: 格式 | 智能合并的输入结构 |
| `OPENSPEC_TASK_UNCHECKED_MARK` | `- [ ]` | `openspec-archive-change/SKILL.md` | 未完成 task 判定；与 `- [x]` 计数比较 | 归档前的完成度门禁 |
| `OPENSPEC_STORE_FLAG` | `--store <id>` | 六个技能 | 仅上述九类命令携带；命令提示已带 flag 时后续沿用 | 多 store 环境不误写 |

### 必须包含的协议字段（此处指规格工件字段）

| 工件/命令 | 关键字段 | 说明 |
|--------|------|------|
| `openspec status --json` | `schemaName`、`planningHome`、`changeRoot`、`artifactPaths`、`actionContext`、`artifacts[].status` | **路径与工件清单一律取自 CLI 输出**，不得假设文件名 |
| `openspec status --json`（propose/apply） | `applyRequires` | 实现前必须就绪的工件 id 列表 |
| `artifactPaths.<id>` | `existingOutputPaths` vs `resolvedOutputPath` | 编辑用前者（已按 glob 展开的真实文件）；**不得写 `resolvedOutputPath`**——对 glob 工件它仍是模式而非文件 |

### 必须实现的函数（关键动作与互斥关系）

| 动作 | 所在技能 | 说明 |
|--------|---------|------|
| 让用户选 change | 全部六个 | `openspec list --json` + AskUserQuestion；**不得猜测或自动选定** change（歧义时必须提示） |
| 归档前评估 delta | `openspec-archive-change` | 存在 delta 规格时须先比对主规格并给「先同步（推荐）/ 不同步直接归档」选项；选同步则以 subagent（`general-purpose`）转调 `openspec-sync-specs` |
| 只做计划不改码 | `openspec-explore` / `openspec-update-change` | 若修订 imply 代码变更，停下并指向 `/opsx:apply` |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| sync 的执行主体 | Agent 驱动（读 delta → 直接编辑主规格） | 让 CLI 机械覆盖 | 支持智能合并（只加一个 scenario 而不抄整条 requirement） |
| 工件路径来源 | 全部取自 CLI JSON | 硬编码 `proposal.md`/`tasks.md` 等名字 | 兼容自定义 schema；硬编码会在换 schema 时全盘失效（`anti_patterns`：do NOT branch on hardcoded artifact names） |
| update 与 continue 的分工 | update 只改已存在工件；新建工件交给 continue | update 顺手补齐缺失工件 | 防止"修订计划"越界成"推进前沿"，破坏可追溯性 |
| 命令命名空间 | Claude 侧 `/opsx:<verb>`、opencode 侧 `/opsx-<verb>` | 两侧用同一字符串 | 宿主工具决定命令解析格式；镜像同步时必须做名称转换，否则技能内的引导语指向不存在的命令 |

## 跨模块依赖

> 外部依赖：

| 依赖 | 引用原因 | 关键符号/路径 | confidence |
|------|---------|---------|------------|
| `openspec` CLI | 六个技能全部通过它读写变更状态 | `openspec new change` / `status` / `list` / `archive` / `store list` | extracted |
| `openspec/` 目录 | 规格与变更的存贮地（技能的实际读写对象） | `openspec/specs/`、`openspec/changes/`、`openspec/changes/archive/` | extracted |
| `.claude/commands/opsx/` | 命令入口，转发到本族技能 | `apply.md`、`propose.md`、`explore.md`、`sync.md`、`update.md`、`archive.md` | extracted |
| `.opencode/skills/` | 同一批技能的镜像副本 | `/opsx-<verb>` 命名的 5 处文本差异 | extracted |
| `agent_hub-main`（`bitget-signal`） | 术语冲突源：那是"行情分析 skill 包"，与本族无关 | `bitget-signal` | inferred |

> 反向调用方：

| 调用方 | 调用场景 | 关键符号 |
|-------|---------|---------|
| 用户会话（Claude Code / opencode） | 斜杠命令 `/opsx:propose` 等 | 六个 `openspec-*/SKILL.md` |
| `code-index-builder`（Step 0a-md） | 生成知识库时把 `openspec/` 当外部知识源摘抄 | `repo_md_map.__openspec__` |

## 典型调用链

### 一个需求从立项到归档
```
用户提出想法 → openspec-explore（只思考，不实现）
  → /opsx:propose → openspec new change "<kebab>"        ← 本模块入口
      → openspec status --change <name> --json            ← 取 applyRequires / artifactPaths
        → 生成 proposal.md / design.md / tasks.md
          → /opsx:apply → openspec-apply-change            ← 跨模块：写业务代码（backend/frontend）
            → task 勾选 `- [ ]` → `- [x]`
              → openspec-sync-specs（delta → openspec/specs/<capability>/spec.md）
                → openspec-archive-change → openspec/changes/archive/<date>-<name>/
```

### 修订既有计划（不推进前沿）
```
用户改主意 → /opsx:update → openspec status --json
  → 只编辑 artifactPaths.<id>.existingOutputPaths          ← 已存在的文件
    → 缺失工件 → 指向 /opsx:continue 创建                   ← 边界：update 不新建
      → 已实现完毕 → 指向 /opsx:apply 把计划增量落到代码
```

## 变更风险

- **硬编码工件文件名或目录布局**（例如把 spec 路径写成常量 `"openspec/changes/<name>/specs/spec.md"`）：换 schema 或迁移到 store 后立即失效，最坏情况是把规格写到规划目录之外、污染版本库（来源: `openspec-update-change/SKILL.md` anti-pattern "do NOT branch on hardcoded artifact names"）。
- **在技能里放宽"必须让用户选 change"**：会把改动落错 change，造成规格与代码对应关系断裂——六个技能的 anti_pattern 反复声明 `Do NOT guess or auto-select a change`（来源: `workspace.json` `anti_patterns`）。
- **在 explore / update 里顺手写实现代码**：破坏"计划层与代码层分离"的留痕契约，归档时 `tasks.md` 与真实代码不再可核对（来源: `openspec-explore/SKILL.md`）。
- **只改 `.claude/skills/openspec-*` 不改 `.opencode/skills/`**：两侧镜像会漂移。已存在 5 处有意差异，全部只是 `/opsx:` ↔ `/opsx-` 的命令命名空间；出现任何语义级差异即为漂移（来源: `.opencode/skills/`）。
- **同步/归档顺序颠倒**：`archive` 前未评估 delta，会使 `openspec/specs/` 落后于已实现代码，后续需求读到过期规格。

## 边界约束

- 允许：`--store <id>` 只在上述九类命令上传；命令提示已带 flag 时后续沿用。**禁止**：给不接收该 flag 的命令硬加（来源: `openspec-archive-change/SKILL.md`）。
- 允许：MODIFIED 中只写新增的那条 scenario。**禁止**：为"保险"把主规格已有 scenario 整段复制过去（来源: `openspec-sync-specs/SKILL.md`）。
- 允许：归档时存在告警只需告知并确认。**禁止**：因告警阻塞归档（来源: `openspec-archive-change/SKILL.md` "Don't block archive on warnings"）。
- 禁止：把 `<context>` / `<rules>` / `<project_context>` 块抄进生成的工件——它们是给 Agent 的约束而非产物内容（来源: `openspec-propose/SKILL.md`）。
- 边界（版本库）：这六个技能与其 opsx 命令**已被 git 跟踪**（与 `code-index-builder`/`codemap-*` 被忽略相反），改动会进 PR 与 CI diff；同时它们是 CLI 生成物（`generatedBy: 1.6.0`），手改内容在下次 `openspec` 再生成时可能被覆盖（来源: `.gitignore` 与 `git ls-files` 结果、技能 frontmatter）。

## 附：内置文档摘要

- `openspec-propose/SKILL.md`：change 名必须是 kebab-case，且需先确认用户到底要建什么，未确认前不得推进。
- `openspec-apply-change/SKILL.md`：以 CLI 输出的 `contextFiles` 为准，遇错误/阻塞/需求不清时暂停而不是猜。
- `openspec-archive-change/SKILL.md`：三步门禁——工件完成度、task 完成度、delta 同步状态，任一不满足都要显式告知并确认后才继续。

> 📄 本节内容来源于仓库内置文档：`.claude/skills/openspec-{propose,explore,apply-change,update-change,sync-specs,archive-change}/SKILL.md` 及镜像 `.opencode/skills/`、`.claude/commands/opsx/`、`.opencode/commands/`（原文已提炼，非完整转录）

## 附：OpenSpec 摘要

- 规格与设计的**权威来源为 `openspec/`**；工作流六技能就是这条规则的机械保障（来源: `openspec/specs/repo-hygiene/spec.md`）。
- 立项顺序受路线图约束：change 按依赖排序（market-data-foundation → indicator-structure-engine → risk-position-management → execution-engine → ai-agent-core → trade-memory-reflection → dl-quant-engine → automation-orchestration → web-frontend），**不得跳过依赖直接实现下游 change**，且每个 change 不得越界实现其它 change 的能力——apply/propose 时应据此检查范围（来源: `openspec/specs/change-roadmap/spec.md`）。
- 归档产物形态实证：`openspec/changes/archive/2026-07-26-*/` 均含 `.openspec.yaml` + `proposal.md` + `design.md` + `tasks.md` + `specs/<capability>/spec.md`，与 `OPENSPEC_ARTIFACT_TRIPLE` 一致；本仓库已归档 10 个 change，`openspec/specs/` 现有 100+ capability 规格。
- 当前 `openspec/config.yaml` 未启用 `context` / `rules`，因此技能生成工件时无项目级附加约束（来源: `openspec/config.yaml`）。
- 术语澄清（避免混淆）：roadmap 设计文档中的"skill"指 `bitget-signal` 的 5 个免 key 行情分析技能与 `bitget-agent-mcp` 承载的技能调用，与本模块的 Agent 技能定义无关（来源: `openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`）。

> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/change-roadmap/spec.md`、`openspec/config.yaml`、`openspec/changes/archive/`（仅提炼接口与约束摘要，非完整规范）
