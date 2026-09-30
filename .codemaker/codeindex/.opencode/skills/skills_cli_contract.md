---
type: "Fragment"
id: ".opencode/skills/cli_contract"
title: "OpenSpec 工作流技能 / CLI 与技能契约"
description: "技能能调用哪些 openspec 命令、拿到哪些 JSON 字段、必须遵守哪些 frontmatter 与命名约定？"
parent: .opencode/skills/_overview.md
fragment: cli_contract
architectural_role: "技能↔CLI↔产物三方的接口契约层"
entity_names:
  constants:
    - name: SCHEMA_NAME
      source: openspec/config.yaml
      value: "spec-driven"
    - name: SKILL_ALLOWED_TOOLS
      source: .opencode/skills/*/SKILL.md frontmatter
      value: "Bash(openspec:*)"
    - name: SKILL_LICENSE
      source: .opencode/skills/*/SKILL.md frontmatter
      value: "MIT"
    - name: SKILL_COMPATIBILITY
      source: .opencode/skills/*/SKILL.md frontmatter
      value: "Requires openspec CLI."
    - name: SKILL_VERSION
      source: .opencode/skills/*/SKILL.md frontmatter metadata.version
      value: "1.0"
    - name: SKILL_GENERATED_BY
      source: .opencode/skills/*/SKILL.md frontmatter metadata.generatedBy
      value: "1.6.0"
    - name: OPSX_COMMAND_SYNTAX
      source: .opencode/skills/*.md vs .claude/skills/*.md 差异行
      value: "OpenCode=/opsx-<action>（连字符）；Claude/Codex=/opsx:<action>（冒号）"
    - name: STORE_FLAG_COMMANDS
      source: 六个 SKILL.md 的 Store selection 段
      value: "new change, status, instructions, list, show, validate, archive, doctor, context"
    - name: STATUS_JSON_KEYS
      source: openspec-propose / update-change / archive-change / sync-specs 的 status 解析步骤
      value: "schemaName, applyRequires, artifacts, isComplete, planningHome, changeRoot, artifactPaths, actionContext"
    - name: INSTRUCTIONS_JSON_KEYS
      source: .opencode/skills/openspec-propose/SKILL.md
      value: "context, rules, template, instruction, resolvedOutputPath, dependencies"
    - name: APPLY_INSTRUCTIONS_KEYS
      source: .opencode/skills/openspec-apply-change/SKILL.md
      value: "contextFiles(artifactId→文件路径数组), progress(total/complete/remaining), tasks, state, instruction"
    - name: ARTIFACT_PATH_FIELDS
      source: .opencode/skills/openspec-update-change/SKILL.md
      value: "artifactPaths.<id>.existingOutputPaths（可写）/ resolvedOutputPath（可能是 glob，不可写）"
    - name: MAIN_SPEC_PATH
      source: .opencode/skills/openspec-sync-specs/SKILL.md
      value: "openspec/specs/<capability>/spec.md"
    - name: DELTA_SECTION_HEADINGS
      source: .opencode/skills/openspec-sync-specs/SKILL.md（Delta Spec Format Reference）
      value: "## ADDED Requirements / ## MODIFIED Requirements / ## REMOVED Requirements / ## RENAMED Requirements"
    - name: RENAME_PAIR_FORMAT
      source: .opencode/skills/openspec-sync-specs/SKILL.md
      value: "FROM: `### Requirement: <旧名>` / TO: `### Requirement: <新名>`"
retrieval_hints:
  - "技能从哪里得到 change 的 artifact 清单和文件路径，而不是自己猜文件名？"
  - "openspec status / instructions 的 --json 返回哪些字段，各自用来决定什么？"
  - "多 store（独立 OpenSpec 仓库）场景下命令要加什么参数？"
  - "SKILL.md 的 frontmatter 必须有哪些字段，删掉 allowed-tools 会怎样？"
  - "⚠️ 如果你找的是 Codemap MCP 的工具契约（search_code / get_symbol_detail 等），不在这里，在 .codemaker/codemap 与 AGENTS.md 的 codemap 段"
  - "⚠️ 如果你找的是知识库生成技能 code-index-builder 的产物契约，不在这里，在 .claude/skills"
  - "架构归属：任何新增的命令行调用约定只能写进对应 SKILL.md 的步骤正文，不可新建独立约定文件（宿主只加载 SKILL.md）"
---

## 业务意图

技能本身不含任何可执行代码，它对系统的全部影响**都是通过 openspec CLI 的命令与 JSON 契约**完成的。这份契约决定了两件业务大事：① Agent 是否会把产物写到正确位置（写错 = 规格脱离主干、reviewer 看不见）；② Agent 是否会在错误的 change 上动刀（选错 = 污染他人正在推进的需求）。

## 对外接口（技能 ↔ openspec CLI）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口 |
|------|------|---------|---------|------|
| `openspec new change <name>` | 技能→CLI | `name`（kebab-case） | 唯一的 change 脚手架入口，同时生成 `.openspec.yaml` | `openspec-propose` 步骤 2 |
| `openspec status --change <name> --json` | CLI→技能 | `schemaName`, `applyRequires`, `artifacts[].status`, `isComplete`, `planningHome`, `changeRoot`, `artifactPaths`, `actionContext` | 所有进度判定的**唯一权威源**；六个技能全部依赖 | 全部六个技能 |
| `openspec instructions <artifact-id> --change <name> --json` | CLI→技能 | `context`, `rules`, `template`, `instruction`, `resolvedOutputPath`, `dependencies` | 给出该 artifact 的写作规范与落盘路径 | `propose`、`update`（大改时） |
| `openspec instructions apply --change <name> --json` | CLI→技能 | `contextFiles`, `progress`, `tasks`, `state` | apply 的执行清单；`state` 三态决定分支 | `apply` 步骤 3 |
| `openspec list --json` | CLI→技能 | 活跃 change 列表、`lastModified` | change 名缺省时的候选来源，也是"禁止自动选中"的对象 | `explore/apply/sync/archive/update` |
| `openspec store list --json` | CLI→技能 | 已注册 store id 列表 | 跨 store（独立 OpenSpec 仓库）场景的前置查询 | 全部六个技能的 Store selection 段 |
| `mkdir -p <changesDir>/archive` + `mv <changeRoot> <archive>/YYYY-MM-DD-<name>` | 技能→文件系统 | 目标名 = 当前日期 + change 名 | 唯二的直接文件操作，绕过 CLI 完成归档 | `archive` 步骤 5 |

> 技能不定义协议、不产生 RPC；"对外契约"即上述 CLI 调用序列与解析字段。

## 必须遵守的技能自身契约

- frontmatter 六件套：`name`（= 目录名，宿主据此命中技能）、`description`（触发语料）、`allowed-tools: Bash(openspec:*)`、`license`、`compatibility`、`metadata.{author,version,generatedBy}`。
- `allowed-tools` 声明该技能只被授权执行 `openspec` 开头的 Bash 命令；它是技能的**能力边界**，不是注释。
- `metadata.generatedBy: "1.6.0"` 记录生成器版本，是判断"本地是否已被手改/是否需回流上游"的唯一线索。
- 正文必须以 `**Input**` → `**Steps**`（编号）→ `**Output**` → `**Guardrails**` 的骨架书写；宿主按步骤编号驱动，打乱骨架会让 Agent 漏执行确认与状态复核环节。

## 实现约束清单

> 改动本模块（含仅调整措辞）前逐条核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `SCHEMA_NAME` | `spec-driven` | `openspec/config.yaml` | 本仓库活跃的 OpenSpec 工作流 schema；决定 artifact 序列 | 仓库唯一声明 schema 之处，改此处即改全流程 |
| `SKILL_ALLOWED_TOOLS` | `Bash(openspec:*)` | 六个 `SKILL.md` frontmatter | 只允许调用 openspec CLI；删除后技能无法执行任何命令 | 由来：CLI 生成模板（`generatedBy: 1.6.0`），— |
| `SKILL_GENERATED_BY` | `1.6.0` | 六个 `SKILL.md` frontmatter | 生成器版本；手改内容需与上游对齐 | 由来：三端镜像共用同一版本号 |
| `OPSX_COMMAND_SYNTAX` | `/opsx-<action>` | `.opencode/skills/*.md` 正文引用处 | 必须指向 `.opencode/commands/opsx-<action>.md` 的**平铺文件名** | OpenCode 命令面是平铺文件，冒号形式无法解析 |
| `STORE_FLAG_COMMANDS` | 9 个命令名 | 六个 `SKILL.md` 的 Store selection 段 | 只有这些命令接受 `--store`，hint 输出已带标志时必须沿用 | 由来：openspec CLI store 语义，— |
| `DELTA_SECTION_HEADINGS` | 4 个 `##` 小节 | `openspec-sync-specs/SKILL.md` | delta spec 的四种意图分区，决定了合并算法 | 由来：OpenSpec delta 约定 |

### 必须实现的函数（此处 = 必须保留的关键步骤）

| 步骤 | 所在文件 | 说明 |
|------|---------|------|
| `openspec status --json` 先行 | 六个 `SKILL.md` | **任何**文件读写前必须先取 `artifactPaths` / `contextFiles`；不得凭记忆或"通常是 `tasks.md`"直接拼路径 |
| artifact 依赖前置读取 | `openspec-propose/SKILL.md` | 创建某 artifact 前必须先读 `dependencies` 列出的已完成文件，否则产物互相矛盾 |
| 循环复核 `applyRequires` | `openspec-propose/SKILL.md` | 每写完一个 artifact 复跑 `status`，直到 `applyRequires` 全部 `done` 才宣布可实现 |
| `existingOutputPaths` 限定写集 | `openspec-update-change/SKILL.md` | 只允许编辑磁盘上已存在的具体文件；glob artifact 不得新增文件 |
| delta↔main 双向读取 | `openspec-sync-specs/SKILL.md` | 改主规格前必须同时读完 delta 与 main，合并须幂等 |
| 归档目标冲突检测 | `openspec-archive-change/SKILL.md` | `mv` 前检测 `archive/YYYY-MM-DD-<name>` 是否已存在，存在则报错终止 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 命令引用语法 | 连字符 `/opsx-apply`（仅本模块副本） | 冒号 `/opsx:apply` | OpenCode 的 `.opencode/commands/` 是平铺文件（`opsx-apply.md`），无命名空间概念；冒号形式在 OpenCode 里指向不存在的命令 |
| 归档实现 | 直接 `mkdir -p` + `mv` 目录 | 调 `openspec archive` 子命令 | 归档被定义为纯位置移动，保留 `.openspec.yaml` 随目录走，避免 CLI 版本差异改变历史目录结构 |
| 规格合并方式 | Agent 智能合并（可只写新增 scenario） | 程序化全文替换 | delta 表达的是**意图**而非整份替换；全文替换会抹掉主规格里未被 delta 提及的要求 |
| artifact 名称处理 | 一律由 `status` JSON 动态取得 | 硬编码 `proposal/design/specs/tasks` | 仓库可换成自定义 schema；硬编码会让自定义 schema 直接失效 |
| `context`/`rules` 处理 | 作为写作约束，禁止抄进产物 | 原样写入 artifact | 它们是给 Agent 的提示注入，抄进去会污染规格正文并泄露工具链样板 |

## 改动它会破坏什么（接口契约风险）

- **把 `/opsx-<action>` 改回冒号形式**：OpenCode 用户按提示执行会命中不存在的命令，流程在技能中途断裂；三端 diff（`.claude`/`.codex` 均为冒号形式）也会失去"唯一差异点"这一可维护性保证。
- **删掉或放宽 `allowed-tools: Bash(openspec:*)`**：技能失去调用 CLI 的能力，或反过来获得任意 shell 权限——前者让六个技能同时失效，后者绕过宿主白名单。
- **改动 `metadata` 中的 `generatedBy`/`author`**：下次 openspec CLI 更新时无法判断本地是否被手改，补丁可能被静默覆盖，也可能产生无意义三方冲突。
- **在技能正文里假定文件名**（"肯定是 `tasks.md`"）：一旦 schema 换掉，apply 会读不到 `contextFiles` 而直接开始改代码，等于跳过规格校验。
- **只改本模块不看另两端**：`archive` 里 "Task 工具调 `openspec-sync-specs`" 的措辞、`update` 里指向 `/opsx-continue`（Claude 端为 `/opsx:continue`）的兜底路径，都是跨文件契约；单端改动会让"引导到下一步命令"指向错误宿主。

## 边界（可做什么 / 禁止什么）

- ✅ 可做：补充/收窄步骤描述、修正 CLI 参数拼写、把含糊的"检查状态"改成显式命令。
- ✅ 可做：在本仓库内做**局部补丁**，但必须把补丁同步登记到另外两端（`.claude/skills`、`.codex/skills`）并保留版本注释。
- ❌ 禁止：新增未经 `openspec status` 输出的路径写入；产物路径的唯一来源是 CLI。
- ❌ 禁止：删除 Store selection 段——它是跨 store 场景下 `--store` 的传递规则，删掉会让命令作用到错误的 planning home。
- ❌ 禁止：把技能拆成更细的多个文件（宿主仅识别 `<skill-dir>/SKILL.md` 单文件）。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| openspec CLI（外部可执行） | 全部读写动作的实际执行者 | `openspec status/instructions/list/new/store` | extracted |
| `openspec/config.yaml` | 决定 `SCHEMA_NAME`，从而决定 artifact 集合与顺序 | `schema: spec-driven` | extracted |
| `.opencode/commands` | 命令面与本模块正文镜像，命令引用语法必须匹配其平铺文件名 | `opsx-apply.md`, `opsx-archive.md` | extracted |
| `.claude/skills`、`.codex/skills` | 同源镜像，差异仅限命令引用语法 | 同名 6 个 `SKILL.md` | extracted |
| `AGENTS.md`（宿主注入的 MCP 契约） | 与本模块并列的另一套工具契约来源，改技能时不可与之冲突 | codemap MCP 工具清单 | inferred |

反向依赖（谁调用了本子模块）：

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `.opencode/commands/opsx-archive.md` | 归档时若需同步，显式以 `Task(subagent_type: "general-purpose")` 调起 `openspec-sync-specs` | `openspec-sync-specs` |
| 宿主技能加载器 | 按 `frontmatter.name` + `description` 命中技能 | `name`, `description` |

## 典型调用链（契约如何被消费）

### 从命令名到落盘路径的完整解析
```
用户输入 /opsx-propose <name>
  → .opencode/commands/opsx-propose.md            ← 命令面（与技能同源）
    → 命中 .opencode/skills/openspec-propose/SKILL.md  ← 本子文档描述的契约在此被使用
      → openspec store list --json                  ← 仅当指定 store 时才走这一支（跨模块：openspec CLI）
      → openspec new change "<name>"                 ← 脚手架，生成 .openspec.yaml
        → openspec status --change --json            ← 取 schemaName / artifactPaths / applyRequires
          → openspec instructions <artifact-id> --json
            → 以 template 为骨架写 resolvedOutputPath  ← 契约落盘点（禁止写 artifactPaths.existingOutputPaths 以外的路径）
```

### 路径解析的分支点（apply 与 update 的差异）
```
openspec instructions apply --change --json
  → contextFiles（已 glob 展开的**具体**文件） ──► apply 直接读，不得自行拼路径
openspec status --change --json
  → artifactPaths.<id>.existingOutputPaths（具体文件）──► update 只写这些
  → artifactPaths.<id>.resolvedOutputPath（可能是 glob）──► update 绝不写这里
```

## 附：OpenSpec 摘要

- 本仓库 `openspec/config.yaml` 只声明 `schema: spec-driven`，并保留 `context`（项目背景注入）与 `rules`（分 artifact 的定制规则）两段**注释态模板**。这意味着技能从 `openspec instructions --json` 拿到的 `context`/`rules` 当前为空，产物写作规范完全来自 schema 内建；一旦有人在此启用 `rules`，六个技能中"context/rules 是约束不是内容、禁止抄进产物"这条禁忌立即变成实际风险点。（来源: openspec/config.yaml）
- 主干规格共 131 个 capability，其中 110 个的 Purpose 仍是 `TBD - created by archiving change <name>. Update Purpose after archive.`——这是 `sync + archive` 链路按现契约执行的**可观测后果**：归档不会为新建主规格补 Purpose。若希望改这一点，只能改 `sync-specs` 的"创建新主规格时补 Purpose"步骤，不能改归档步骤。（来源: openspec/specs/、openspec/changes/archive/）

> 📋 本节内容来源于 OpenSpec：`openspec/config.yaml`、`openspec/specs/*`、`openspec/changes/archive/*`（仅提炼契约摘要，非完整规范转录）
