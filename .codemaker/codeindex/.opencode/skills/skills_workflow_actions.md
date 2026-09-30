---
type: "Fragment"
id: ".opencode/skills/workflow_actions"
title: "OpenSpec 工作流技能 / 动作与生命周期"
description: "OpenSpec 的一个 change 从探索、立项到实现、同步、归档要按什么顺序推进，各由哪个技能负责？"
parent: .opencode/skills/_overview.md
fragment: workflow_actions
architectural_role: "研发流程层核心：change 生命周期的六个动作切面"
entity_names:
  constants:
    - name: OPSX_ACTION_SET
      source: .opencode/skills（6 个 SKILL.md 的 frontmatter.name 合集）
      value: "explore / propose / update / apply / sync / archive"
    - name: ARTIFACT_BUILD_ORDER
      source: README.md（## 开发与贡献）+ openspec-propose/SKILL.md
      value: "proposal → design → specs → tasks"
    - name: TASK_TODO_MARK
      source: .opencode/skills/openspec-apply-change/SKILL.md
      value: "- [ ]"
    - name: TASK_DONE_MARK
      source: .opencode/skills/openspec-apply-change/SKILL.md
      value: "- [x]"
    - name: APPLY_STATE_BLOCKED
      source: .opencode/skills/openspec-apply-change/SKILL.md
      value: "blocked（缺 artifact，提示改用 continue）"
    - name: APPLY_STATE_ALL_DONE
      source: .opencode/skills/openspec-apply-change/SKILL.md
      value: "all_done（提示归档）"
    - name: ARCHIVE_NAME_FORMAT
      source: .opencode/skills/openspec-archive-change/SKILL.md
      value: "YYYY-MM-DD-<change-name>"
    - name: ARTIFACT_STATUS_DONE
      source: .opencode/skills/openspec-archive-change/SKILL.md（artifacts[].status）
      value: "done"
retrieval_hints:
  - "新需求的 OpenSpec change 应该怎么立项并把 proposal/design/tasks 一次生成齐？"
  - "实现 OpenSpec change 的任务时，应该走哪个技能，勾选状态写在哪里？"
  - "change 做完后怎么归档，归档目录名规则是什么？"
  - "⚠️ 如果你找的是 code-index-builder / codemap-exploring 等知识库与调试技能，不在这里，在 .claude/skills"
  - "⚠️ 如果你找的是 `/opsx:*` 冒号形式的命令入口，不在这里，在 .claude/commands/opsx/ 与 .codex/skills"
  - "本模块也叫 OPSX / opsx 技能集，对应需求中的「规格驱动开发流程」「change 生命周期」"
  - "架构归属：新增一个 OpenSpec 动作必须同时新建 `.opencode/skills/<动作名>/SKILL.md` 与 `.opencode/commands/<动作名>.md`，不可只改一处，也不可把新动作写进已有技能正文"
---

## 业务意图

这六个技能解决的是同一个协作问题：**在没有人工盯守的情况下，让任意 Agent 用同一套顺序和同一套术语推进一个需求**，使"规格说做了什么"和"代码实际做了什么"始终可核对。每个技能只承担一个动作切面，动作之间靠 openspec CLI 的 JSON 状态而非 Agent 记忆衔接。

> 本子模块无对外接口：它不定义协议、不被任何代码调用，对外契约全部体现在与 openspec CLI 的命令序列上（见 `skills_cli_contract.md`）。

## 六个动作的职责边界

| 技能（目录名） | 动作 | 解决的业务问题 | 允许的写入 | 禁止的越界 |
|---|---|---|---|---|
| `openspec-explore` | 思考同伴 | 需求模糊时先对齐问题空间、方案取舍与风险，避免带着错误假设立项 | 仅可选地创建/更新 OpenSpec artifact | 禁止写任何应用代码 |
| `openspec-propose` | 立项 | 一次把 proposal / design / specs / tasks 造齐到"可实现"，避免实现期才发现计划缺失 | 新建 change 目录与其全部 artifact | 不在立项阶段改业务代码 |
| `openspec-update-change` | 修订计划 | 实现过程中计划漂移时，让既有 artifact 彼此重新自洽 | 只改**已存在**的 artifact 文件 | 禁止新建 artifact、禁止在 glob artifact 下造新文件、禁止改代码 |
| `openspec-apply-change` | 实现 | 按 tasks 逐条落地并即时回写勾选，保证进度可信 | 业务代码 + tasks 勾选状态 | 不假设文件名，只读 CLI 给出的 `contextFiles` |
| `openspec-sync-specs` | 同步规格 | 把 change 的 delta spec 智能合并进主干 spec，使主干规格成为唯一事实源，且**不**结束 change 生命周期 | `openspec/specs/<capability>/spec.md` | 不归档 change；不做 wholesale 覆盖式替换 |
| `openspec-archive-change` | 归档 | 实现完成后把 change 移出活跃区，归档前先评估是否需要同步 | `mkdir archive` + `mv changeRoot` | 不因警告而阻塞（提示并确认即可）；目标同名已存在时报错而非覆盖 |

## change 生命周期（状态流转）

```
   (无 change)
        │ propose（唯一"造 artifact"入口）
        ▼
 ┌──────────────────────────┐        update：任意时刻修订已存在的 artifact
 │ proposal / design /      │ ◄───────────────────────────────────────────┐
 │ specs / tasks  (draft)   │                                              │
 └───────────┬──────────────┘                                              │
             │ instructions apply → state != blocked                       │
             ▼                                                             │
      apply（逐条 task：- [ ] → - [x]）── 遇阻塞/设计冲突 ──► 回到 update ──┘
             │ state == all_done
             ▼
   sync（delta specs → openspec/specs/<capability>/spec.md，可提前反复执行）
             │
             ▼
   archive（mv 到 archive/YYYY-MM-DD-<name>/，.openspec.yaml 随目录一起搬走）
```

> 该流程**刻意不是阶段锁**：`explore` 与 `update` 可在任意节点插入（技能文本称 "actions on a change" model / fluid workflow），因此"必须先完成前一个 artifact 才能调用某技能"这类强约束**不得**被添加进技能，否则会让实现中期发现的设计漂移无处回写。

## 典型调用链

### 立项一个新 change（propose）
```
用户 /opsx-propose ──► .opencode/commands/opsx-propose.md（命令面镜像）
  → 本模块入口：.opencode/skills/openspec-propose/SKILL.md
    → openspec new change "<name>"                     ← 跨模块：openspec CLI（脚手架 change 目录 + .openspec.yaml）
    → openspec status --change "<name>" --json         ← 读取 applyRequires / artifacts / artifactPaths
    → openspec instructions <artifact-id> --json        ← 取 context / rules / template / resolvedOutputPath
      → 写 proposal.md → design.md → specs/**/*.md → tasks.md   ← 产物落在 openspec/changes/<name>/
    → 复跑 openspec status --change "<name>"            ← 校验 applyRequires 全部 done
```

### 实现一个 change（apply）
```
用户 /opsx-apply ──► .opencode/commands/opsx-apply.md
  → .opencode/skills/openspec-apply-change/SKILL.md     ← 本模块入口
    → openspec status --change --json                   ← 取 schemaName / planningHome / changeRoot
    → openspec instructions apply --change --json        ← 取 contextFiles / state / progress
      → state == "blocked" ──► 终止并建议 continue（补 artifact）
      → state == "all_done" ──► 终止并建议 archive
    → 读全部 contextFiles ──► 改业务代码（backend/ 或 frontend/）
    → tasks 文件内 "- [ ]" → "- [x]"                    ← 每条完成立即回写
```

### 收口一个 change（archive + sync）
```
用户 /opsx-archive ──► .opencode/commands/opsx-archive.md
  → .opencode/skills/openspec-archive-change/SKILL.md   ← 本模块入口
    → openspec list --json                              ← 若未给 change 名：必须让用户选，禁止猜
    → openspec status --change --json                    ← 检查 artifacts 是否 done
    → 读 tasks 文件统计 "- [ ]" 数量                      ← 未完成则警告 + 确认，但仍不阻塞
    → artifactPaths.specs.existingOutputPaths 是否有 delta spec
      → 有 ──► Task(general-purpose) 调 .opencode/skills/openspec-sync-specs/SKILL.md
                 → 编辑 openspec/specs/<capability>/spec.md   ← 跨模块：主干规格被改写
    → mkdir -p "<changesDir>/archive" && mv changeRoot "archive/YYYY-MM-DD-<name>"
```

## 实现约束清单

> 本子文档含任务勾选状态与 change 生命周期状态，改动相关技能步骤前核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `ARTIFACT_BUILD_ORDER` | `proposal → design → specs → tasks` | README.md、`openspec-propose/SKILL.md` | 当前 schema 的 artifact 创建序 | 反循环依赖：后者要读前者作为上下文 |
| `TASK_TODO_MARK` / `TASK_DONE_MARK` | `- [ ]` / `- [x]` | `openspec-apply-change/SKILL.md` | 进度唯一事实载体；archive 的未完成任务统计也靠它 | 非布尔字段而是行首标记，允许多人并行添加 task |
| `APPLY_STATE_BLOCKED` / `APPLY_STATE_ALL_DONE` | `blocked` / `all_done` | `openspec-apply-change/SKILL.md`（apply instructions `state`） | 两个必须提前退出的分支：前者转 `continue`，后者转 `archive` | 避免在 artifact 不全时写代码，或已完成后重复劳动 |
| `ARTIFACT_STATUS_DONE` | `done` | `openspec-archive-change/SKILL.md`、`openspec-propose/SKILL.md` | 判定 artifact / change 就绪的唯一值 | 进度由 CLI 计算，不得靠 Agent 自评 |

> ⚠️ 以上四个值均为 CLI 输出/标记字面量，**不得在技能文本里内联改写成同义词**（如把 `- [x]` 换成 `[x]`、把 `all_done` 换成 `done`）；不匹配就会造成“看起来完成了但 status 不认”的静默失败。

### 必须实现的函数（此处 = 必须保留的动作划分）

| 动作 | 所在文件 | 说明 |
|--------|---------|------|
| 创建 artifact | `openspec-propose/SKILL.md` | 全集里**唯一**的创建入口；其他技能只能读或改已存在的文件 |
| 写代码 + 回写勾选 | `openspec-apply-change/SKILL.md` | 完一条立即回写，不允批处理 |
| 写主干规格 | `openspec-sync-specs/SKILL.md` | 全集内唯一改写 `openspec/specs/` 的动作 |
| 生命周期终点 | `openspec-archive-change/SKILL.md` | 归档前必须完成 sync 评估并展示合并摘要 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 进度载体 | tasks 文件行首 `- [x]` | 独立进度字段 / CLI 侧记录 | 跟文件一起提交、可 diff、多人并行不冲突 |
| 动作划分粒度 | 六个独立技能（一动作一文件） | 一个大技能内部分支 | 只加载被命中的技能，避免无关步骤干扰；且与三端镜像一一对应 |
| 阶段约束 | fluid（可任意时刻插入 explore/update） | 严格阶段锁 | 实现中出现设计冲突时需要通道回写计划 |

## 改动它会破坏什么（变更风险）

| 改动动作 | 破坏的业务规则 | 后果 |
|---|---|---|
| 让 `apply` 在 artifact 缺失时自行补建 | `propose`/`continue` 是唯一的 artifact 创建者，创建顺序由 schema 的 artifact 依赖决定 | tasks 与 specs 各写各的，归档后主干规格不可信；本仓库已有 110 个主干 capability 的 Purpose 停留在 `TBD - created by archiving`，再叠加错误合并会使规格彻底无法回溯 |
| 让 `update` 允许新建 artifact 或代码 | `update` 与 `continue`/`apply` 的动作边界 | 用户在"修订计划"时意外产生半成品文件，glob artifact（`specs/**/*.md`）下凭空多出无人审阅的规格文件 |
| 在勾选环节改成"全部完成再统一回写" | 技能要求"完成一条立即把 `- [ ]` 改 `- [x]`" | 会话被中断时进度丢失，`archive` 的未完成任务统计失真，会把没做完的 change 归档掉 |
| 归档时改用 CLI `openspec archive` 或允许同名覆盖 | 技能明确用 `mv` 且目标存在即报错 | 同名 archive 被覆盖 = 历史规格永久丢失（当前 archive 已有 81 个按日期命名的 change） |
| 只改本模块、不改 `.claude/skills`、`.codex/skills` | 三端同源镜像 | 不同宿主（OpenCode / Claude / Codex）Agent 得到不同流程话术与不同命令引用，交叉验证失效 |

## 边界（可做什么 / 禁止什么）

- ✅ 可以在不改变动作语义的前提下改文案、输出格式、示例；这些是纯表现层，不影响下游 `openspec/` 产物结构。
- ✅ 必须让"进度、文件名、artifact 清单"一律来自 `openspec status` / `openspec instructions` 的 JSON。
- ❌ 禁止在技能文本里写死 artifact 名或产物路径（如假定一定有 `tasks.md`）——schema 可换，硬编码会让自定义 schema 直接失效（由来：`.opencode/skills/openspec-update-change/SKILL.md:45`）。
- ❌ 禁止把 `explore` 改成"可以给实现建议并顺手改代码"——它的全部价值在于"只思考不实现"（由来：`.opencode/skills/openspec-explore/SKILL.md:283`）。
- ❌ 禁止在本模块内新增业务运行时逻辑：本目录不会被 backend/frontend 的任何代码 import，也不会被 CI 校验（`.github/workflows/ci.yml` 与 pre-commit 只覆盖 `backend/`、`frontend/`）。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `openspec/`（外部 CLI + 产物目录） | 六个技能全部通过 `openspec` 命令读写 change 与 spec | `openspec new change`, `openspec status`, `openspec instructions`, `openspec list` | extracted |
| `.opencode/commands` | 命令入口正文与本模块技能正文镜像 | `opsx-propose.md` … `opsx-archive.md` | extracted |
| `openspec/specs` | `sync-specs` 的直接写入目标 | `openspec/specs/<capability>/spec.md` | extracted |
| `openspec/changes` | 输入与归档落点 | `openspec/changes/<name>/`, `openspec/changes/archive/` | extracted |
| `backend/`、`frontend/` | `apply` 阶段被修改的实际代码所在（本模块不 import，仅通过任务描述间接触达） | — | inferred |

反向依赖（谁调用了本子模块）：

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `.opencode/commands/opsx-*.md` | 用户敲斜杠命令时加载同名流程正文；`opsx-archive.md:62` 显式要求以 Task(general-purpose) 方式调起 `openspec-sync-specs` | `/opsx-apply`, `/opsx-archive` |
| 用户 / 上层 Agent 会话 | 自然语言"开始实现""归档这个 change"时按 description 命中技能 | `openspec-propose`, `openspec-apply-change` |
| `.github/workflows/ci.yml`、pre-commit | **不**调用本模块，因此本模块无自动回归 | —（这是风险，不是依赖） |

> 📄 本节内容来源于仓库内置文档：`README.md`（流程顺序）、`openspec/specs/change-roadmap/spec.md`（change 独立立项与不越界）、`openspec/specs/repo-hygiene/spec.md`（`openspec/` 为规格权威来源）。
