---
type: "Fragment"
id: ".opencode/skills/guardrails"
title: "OpenSpec 工作流技能 / 禁忌与边界"
description: "改动 OpenSpec 技能时哪些行为被明令禁止，为什么禁止，违反了会造成什么后果？"
parent: .opencode/skills/_overview.md
fragment: guardrails
architectural_role: "流程护栏：把 Agent 的自由度收敛到可审计的边界内"
entity_names:
  constants:
    - name: FORBIDDEN_ARTIFACT_BLOCKS
      source: .opencode/skills/openspec-propose/SKILL.md
      value: "<context> / <rules> / <project_context>（禁止出现在产物文件中）"
    - name: EXISTING_OUTPUT_PATHS
      source: .opencode/skills/openspec-update-change/SKILL.md
      value: "artifactPaths.<id>.existingOutputPaths（唯一可写集合）"
    - name: RESOLVED_OUTPUT_PATH_KIND
      source: .opencode/skills/openspec-update-change/SKILL.md
      value: "glob 模式（如 specs/**/*.md），不可作为写入目标"
    - name: SYNC_IDEMPOTENT
      source: .opencode/skills/openspec-sync-specs/SKILL.md
      value: "true（同一 delta 重复执行必须得到相同结果）"
    - name: ARCHIVE_BLOCKING_POLICY
      source: .opencode/skills/openspec-archive-change/SKILL.md
      value: "warn-and-confirm（不因未完成 artifact/task 阻塞归档）"
    - name: ARCHIVE_COLLISION_POLICY
      source: .opencode/skills/openspec-archive-change/SKILL.md
      value: "fail（目标目录已存在时终止，不得覆盖）"
    - name: CHANGE_SELECTION_POLICY
      source: .opencode/skills/openspec-archive-change、openspec-sync-specs、openspec-update-change 三个 SKILL.md
      value: "never-auto-select（必须由用户选择）"
retrieval_hints:
  - "为什么技能不允许 Agent 自己挑一个 change 就开始改，而不是问用户？"
  - "哪些内容绝对不能写进 OpenSpec 产物文件里？"
  - "归档时发现还有未完成的 task 会怎样，会阻塞吗？"
  - "本模块的改动谁来做质量把关，有 CI 或 lint 覆盖吗？"
  - "⚠️ 如果你要找的是业务代码的编码规范或测试门禁（ruff / Biome / pytest 三层），不在这里，在 backend/tests 与 .github/workflows"
  - "⚠️ 如果你要找的是 UI/前端的交互约束，不在这里，在 frontend/src"
  - "架构归属：新的流程禁忌必须追加到最相关 SKILL.md 的 **Guardrails** 段，不可新建约束文档"
---

## 业务意图

本模块的护栏解决一个具体的管理问题：**规格是多人（多 Agent）共用的共享状态，而 Agent 天然倾向于"自行补齐、自行推进"**。护栏把"哪些自由必须交还给人类"写成硬规则，以免自动化在共享状态上做出不可逆的越权写入——尤其在本仓库已有 131 份主干规格、81 个历史归档的现实下，一次误归档或误合并就是永久性的规格丢失。

本模块的护栏还承担一个"低成本纠错"职能：规则几乎都写成一句可判定的祈使句（禁止自动选中、必须逐条确认、目标存在即失败），使得复核者不需要读懂全套 OpenSpec 语义就能判断某个改动是否越界。这是刻意的——因为本模块**没有任何自动门禁**（CI 只跑 `backend/` 的 ruff 与 pytest、`frontend/` 的 Biome 与 vitest；pre-commit 同理），一旦护栏写得含糊，就没有第二道防线。

## 禁忌清单（什么禁止做，为什么）

| 禁忌 | 规则 | 约束由来 / 后果 |
|------|------|----------------|
| 探索期写应用代码 | `explore` 可以读代码、画图、提方案、甚至写 OpenSpec artifact，但**绝不**写实现代码 | 由来：`.opencode/skills/openspec-explore/SKILL.md:283`。若允许，模糊需求会被"顺手实现"，规格与代码同时脱轨且无人复核 |
| 修订期改代码 / 造新 artifact | `update` 只改已存在的 planning artifact，禁止写代码、禁止推进 build frontier | 由来：`SKILL.md:57`、`:84`。创建 artifact 是 `/opsx-continue` 的职责；越权会产生无人审阅的规格文件 |
| 自动选中 change | `archive` / `sync-specs` / `update-change` **禁止**猜测或自动选择 change，必须让用户选 | 由来：三个 `SKILL.md` 各有一行 "Do NOT guess or auto-select a change"（anti_patterns 命中 3 处）。库里同时存在多个活跃/历史 change，猜错等于改写他人需求的主规格 |
| 把约束块抄进产物 | `<context>` / `<rules>` / `<project_context>` 只能作为 Agent 的写作约束，禁止写入 artifact | 由来：`openspec-propose/SKILL.md:74,106`。抄进去会污染规格正文，使后续 Agent 把工具链样板当成需求 |
| 写入 glob 路径 | 只写 `existingOutputPaths`；`resolvedOutputPath` 可能是 glob，禁止作为写入目标 | 由来：`openspec-update-change/SKILL.md:47`。写 glob 会凭空造出无依赖、无审阅的规格文件 |
| 假定文件名 / 硬编码 artifact 名 | 一律读 CLI 输出的 `contextFiles` 与 `artifacts`，禁止"通常是 tasks.md"式假设 | 由来：`openspec-apply-change/SKILL.md:153`、`openspec-update-change/SKILL.md:45`。schema 可替换，硬编码使自定义 schema 不可用 |
| 因警告阻塞归档 | 未完成 artifact / task 只做"提示 + 确认"，不阻塞 | 由来：`openspec-archive-change/SKILL.md:114`。归档是流程终点，硬阻塞会让已完成的工作卡在活跃区 |
| 覆盖同名归档 | `archive/YYYY-MM-DD-<name>` 已存在时报错终止 | 由来：`SKILL.md` 步骤 5。当前 archive 目录已按日期累积 81 个 change，覆盖 = 历史规格永久丢失 |
| 无确认即写入 | `update` 的每条修订必须逐条展示并获用户确认后才落盘；用户拒绝的修订不得写入 | 由来：`openspec-update-change/SKILL.md:62`。修订是语义变更，误写会让实现照着错的计划走 |
| 探索期强加结构 | `explore` 不设固定步骤、不要求固定产出、不替用户决定要不要落成 artifact（offer，不 auto-capture） | 由来：`openspec-explore/SKILL.md:133,137,286,287`。探索的价值在发散，脚本化会掐掉方案对比 |

## 实现约束清单

> 修改本模块（或复核本模块是否被误改）时必须逐条核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `FORBIDDEN_ARTIFACT_BLOCKS` | `<context>` / `<rules>` / `<project_context>` | `openspec-propose/SKILL.md` | 三个不得出现在产物中的注入块名 | 注入块是 Agent 的约束，不是需求内容 |
| `CHANGE_SELECTION_POLICY` | `never-auto-select` | `archive`、`sync-specs`、`update-change` | 未给 change 名时必须询问 | 保护共享状态不被误改 |
| `ARCHIVE_COLLISION_POLICY` | `fail` | `openspec-archive-change/SKILL.md` | 目标目录已存在即失败 | 防历史规格被覆盖 |
| `ARCHIVE_BLOCKING_POLICY` | `warn-and-confirm` | `openspec-archive-change/SKILL.md` | 未完成项不阻塞 | 归档是终点，硬阻塞会积压 |
| `SYNC_IDEMPOTENT` | `true` | `openspec-sync-specs/SKILL.md` | 同一 delta 重复合并结果一致 | 支持重跑与失败恢复 |
| `RESOLVED_OUTPUT_PATH_KIND` | `glob` | `openspec-update-change/SKILL.md` | `resolvedOutputPath` 对 glob artifact 仍是模式串 | 防止把模式串当路径写文件 |

### 必须实现的函数（此处 = 必须保留的判定步骤）

| 判定 | 所在文件 | 说明 |
|------|---------|------|
| "未给 change 名 → 必须询问" | `archive` / `sync-specs` / `update-change` | **不得**用 "只有 1 个活跃 change 就自动选" 之外的方式静默选择；`apply` 允许在唯一活跃 change 时自动选中，但 `archive` 等三处明文禁止 |
| "artifact 未 done → 警告 + 确认" | `openspec-archive-change/SKILL.md` | 先列未完成 artifact，再确认是否继续 |
| "task 未勾选 → 警告 + 确认" | `openspec-archive-change/SKILL.md` | 读 tasks 文件统计 `- [ ]` 数量 |
| "delta spec 存在 → 先评估再询问" | `openspec-archive-change/SKILL.md` | 与主规格比对后给出合并摘要，再让用户选"现在同步 / 不同步" |
| "用户拒绝 → 不写入" | `openspec-update-change/SKILL.md` | 逐条确认的落实点 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 归档阻断策略 | 警告后仍可继续（`warn-and-confirm`） | 硬阻塞直到全部完成 | 归档属于行政收口，历史 change 常因返工而长期滞留活跃区；硬阻塞会让 archive 目录失去"时间线"意义 |
| change 选择策略 | 强制用户选择 | 按 `lastModified` 自动选最近 | 共享状态下"最近改动"≠"本次目标"；`update` 虽会给出推荐标记，但仍必须由用户确认 |
| 规格合并策略 | Agent 智能合并 delta（partial update 合法） | 全文替换 | 全文替换会删掉主规格中 delta 未提及的要求，属于静默需求删除 |
| 探索期产出策略 | offer 不 auto-capture | 自动把结论写成 artifact | 未成形的想法落成规格会误导后续实现；由用户决定何时固化 |
| 护栏位置 | 写在每个 `SKILL.md` 的 **Guardrails** 段 | 集中到一份全局约束文档 | 宿主只加载被命中的 SKILL.md，集中式文档不会被读到 |

## 改动它会破坏什么（变更风险）

1. **删掉"禁止自动选中 change"**：在本仓库 `openspec/changes/archive/` 已累计 81 个历史 change 的环境中，Agent 极易按"最近修改"挑中他人正在推进的 change，`sync-specs` 会直接把错误的 delta 合并进主干 `openspec/specs/`——这类污染无法靠 diff 轻易发现，因为主干规格的变更本身就是逐条合并的。
2. **放宽"只写已存在文件"**：`update` 若允许在 glob artifact 下新建文件，会绕过 `propose` 的依赖顺序，产生缺 `design` 却先有 `specs` 的 change；`apply` 随后读 `contextFiles` 时会拿到结构不完整的上下文并照此实现。
3. **去掉逐条确认**：`update` 会一次写入多份互相关联的 artifact，若不再逐条确认，用户失去对"计划往哪改"的否决权，实现阶段才发现偏差时已产生代码。
4. **改掉归档的"不阻塞"语义**：历史 change 会长期卡在活跃区，`openspec list --json` 的活跃集持续膨胀，`explore`/`apply` 的候选列表质量下降（候选越多，越容易选错——与 1 叠加放大）。
5. **把护栏挪去别处**：本模块仅靠 `SKILL.md` 单文件被宿主加载，任何"写在别处的约束"对执行中的 Agent 等于不存在。

## 边界（可做什么 / 禁止什么）

- ✅ 可做：把新发现的踩坑点补进对应技能的 **Guardrails** 段，措辞与既有条目保持同一句式。
- ✅ 可做：强化确认环节（例如要求展示 diff 摘要后再确认）。
- ❌ 禁止：把护栏实现为脚本/钩子后移除文本护栏——本模块没有任何 CI 或 pre-commit 覆盖（`.github/workflows/ci.yml` 与 `.pre-commit-config.yaml` 只对 `backend/`、`frontend/` 生效），一旦文本规则消失就完全无约束。
- ❌ 禁止：为 `explore` 增加"可写实现代码"的例外；也禁止给 `apply` 增加"可直接改 specs"的捷径——写主规格的职责唯一归 `sync-specs`（由来：`archive` 中仅通过 Task 调起 `openspec-sync-specs` 一条路径）。
- ❌ 禁止：删除 `explore` 的 "Don't implement" 与 `update` 的 "NEVER edit implementation code"——这两条是"计划"与"实现"两阶段不互相污染的唯一保证。

## 改动本模块后的复核动作（无 CI 下的替代门禁）

因本模块不受任何自动检查覆盖，“改完就看”必须以固定动作完成，否则修改会默片生效：

1. 先比对三端镜像。以 `diff .opencode/skills .claude/skills` 与 `diff .opencode/skills .codex/skills` 确认差异**只出现在命令引用语法行**（`/opsx-<action>` vs `/opsx:<action>`）。任何其他差异都意味着只改了其中一端，需补齐。
2. 再确认命令可解耦。把正文里每一处 `/opsx-*` 引用与 `.opencode/commands/` 下的实际文件名逐一对应；OpenCode 命令面是平铺文件（`opsx-apply.md`），不存在 `opsx/` 子目录，因此引用一旦写成冒号形式就是死链。
3. 然后确认产物路往未硬编码。全文搜索 `tasks.md`、`proposal.md` 等文件名与 `openspec/changes/` 前缀：除作为示例解释外，任何“技能直接假定该路径存在”的表述都违反了“路往一律来自 `status`/`instructions` JSON”的契约（由来：`openspec-update-change/SKILL.md:45` 明文禁止分支于硬编码 artifact 名）。
4. 最后确认未越写代码的线。`explore` 与 `update` 两个技能全文不得出现“可以顺手实现/直接改业务文件”类表述；一旦出现，本模块与 `apply` 的职责划分失效，`openspec/specs/` 与真实代码会开始漂移。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `openspec/specs` | 禁忌保护的目标资产：共享主干规格 | `openspec/specs/<capability>/spec.md` | extracted |
| `openspec/changes` | 归档落点与"禁止覆盖同名"约束的作用域 | `openspec/changes/archive/YYYY-MM-DD-<name>` | extracted |
| `.opencode/commands` | 命令面同样载有这些护栏文本，改动需同步 | `opsx-archive.md`, `opsx-update.md` | extracted |
| `.github/workflows`、`.pre-commit-config.yaml` | **不覆盖本模块**，这是"必须保留文本护栏"的根本原因 | `ci.yml`（backend/frontend 两个 job）、ruff/biome hooks | extracted |

反向依赖（谁调用了本子模块）：

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| 宿主技能加载器 | 命中技能后加载整份 `SKILL.md`，护栏随正文一起生效，无独立入口 | `SKILL.md` |
| `.opencode/commands/opsx-*.md` | 命令面中含同名护栏段落，二者任一缺失都会让约束半失效 | `/opsx-archive` |

## 典型调用链（护栏生效点）

### 归档时护栏拦截未完成项
```
/opsx-archive ──► .opencode/commands/opsx-archive.md
  → .opencode/skills/openspec-archive-change/SKILL.md        ← 本模块入口
    → openspec list --json                                   ← 未给名字：必须问用户（护栏 #3）
    → openspec status --change --json → artifacts[].status≠done
      → 列出未完成 artifact + AskUserQuestion 确认           ← 护栏：warn-and-confirm
    → 读 tasks 文件统计 "- [ ]" → 再次确认                    ← 护栏：warn-and-confirm
    → 目标 archive/YYYY-MM-DD-<name> 已存在？ ── 是 ──► 报错终止   ← 护栏：fail
```

### 修订时护栏强制确认
```
/opsx-update ──► .opencode/commands/opsx-update.md
  → .opencode/skills/openspec-update-change/SKILL.md         ← 本模块入口
    → openspec status --change --json → artifactPaths.<id>.existingOutputPaths
      → 只读已存在文件，构建"修订提案 + 理由"清单
        → 逐条展示并等待用户确认 ── 拒绝 ──► 不写入（护栏）
          → 确认 ──► 写入该 artifact
    → 仍缺 artifact？ ──► 只提示 /opsx-continue，不得自行创建（护栏：不推进 frontier）
```

> 📄 本节内容来源于仓库内置文档：`.opencode/skills/*/SKILL.md` 的 **Guardrails** 段（原文已提炼为约束清单，非完整转录）；`openspec/specs/change-roadmap/spec.md`（change 不越界实现他 change 的能力）。
