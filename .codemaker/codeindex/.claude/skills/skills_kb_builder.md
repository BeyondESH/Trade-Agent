---
type: "Fragment"
id: .claude/skills/kb_builder
title: "Agent 技能定义层 / 知识库构建规程"
description: "怎么为这个仓库生成/更新 .codemaker/codeindex 知识库？"
parent: /.claude/skills/_overview.md
fragment: kb_builder
entity_names:
  constants:
    - name: MODULE_COUNT_MIN
      value: "10"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: MODULE_COUNT_MAX
      value: "20"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: SUBDOC_BODY_MIN_CHARS
      value: "100"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: RETRIEVAL_HINTS_MIN
      value: "4"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: CONCEPT_INDEX_MIN_ENTRIES
      value: "15"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: SUBDOC_SPLIT_SMALL_MAX_FILES
      value: "5"
      source: .claude/skills/code-index-builder/SKILL.md
    - name: SUBDOC_SPLIT_LARGE_MIN_FILES
      value: "15"
      source: .claude/skills/code-index-builder/SKILL.md
retrieval_hints:
  - "怎么给这个仓库生成知识库 / 更新知识库？"
  - "生成 .codemaker/codeindex 的完整流程有哪些步骤？"
  - "知识库文档的 frontmatter 字段有哪些是必填的？"
  - "⚠️ 如果你要找的是脚本本身的实现（build_index.py 等），不在这里，在 skills_kb_scripts.md"
  - "本模块也叫「建知识库 / 生成 codeindex / 知识沉淀」，对应需求中的「为仓库做知识沉淀」"
  - "新增一个模块的知识文档时，产物必须落在哪个目录、文件名怎么起？"
architectural_role: "Agent 技能定义层中的规程主文档：唯一定义知识库产物契约与构建流水线的技能"
---

## 业务意图

这个技能解决的是**"代理每次都要从零 Grep 才能理解仓库"**的问题：它把仓库的架构约束、模块边界、业务规则一次性沉淀成 `.codemaker/codeindex/` 下的结构化文档，供 `search_knowledge` 在后续需求中直接召回。因此它沉淀的是**业务规则与架构约束**（"改动会破坏什么""什么禁止做"），而**不沉淀**符号定义、调用图、类层次——那部分明确交给 Codemap MCP 实时提供（来源: `.claude/skills/code-index-builder/SKILL.md`「本 Skill 的业务定位」）。

## 对外接口

本技能无网络协议/事件接口；其"契约"是**文档产物契约**与**工具调用契约**，二者都是硬约束：

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `_overview.md` frontmatter | 产物 | `type: "Module"`、`id`、`title`、`description`、`module_id`、`architectural_role` | 模块概览，`title` 必须是 2–5 词中文架构角色 | `code-index-builder/SKILL.md` |
| `{module_id}_{sub}.md` frontmatter | 产物 | `type: "Fragment"`、`parent`、`fragment`、`entity_names.constants`、`retrieval_hints` | 子文档，常量必须带 `name`+`source`+`value` | 同上 |
| `kb-config.json` | 产物 | `kb_path`、`src_path`、`description` | 模块注册表，**必须落在知识库根一级目录**，不能放进 `<repo-name>/` 子目录 | `code-index-builder/SKILL.md` Step 9 |
| `workspace.json` | 输入 | `scan_mode`、`top_level_modules`、`module_types`、`anti_patterns`、`cross_module_hints` | 由 Codemap 预生成；本技能**禁止**自己跑扫描脚本重造 | `code-index-builder/SKILL.md` Step 1 |
| `get_graph_stats()` | 前置探测 | 返回文件数/符号数 | Codemap 可用性门禁；失败或 `files=0` 必须中止构建 | Step 0-codemap |

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `MODULE_COUNT_MIN` | `10` | `.claude/skills/code-index-builder/SKILL.md` | 模块数目标下限；< 10 自动降 `depth=2` | 核心原则：模块数目标 10–20 |
| `MODULE_COUNT_MAX` | `20` | 同上 | 模块数上限；> 20 默认全量生成，仅在用户要求缩减时才询问 | 同上 |
| `SUBDOC_BODY_MIN_CHARS` | `100` | 同上（Step 8.3） | 子文档正文最小字数，低于即警告 | 防退化：正文过短说明只是清单 |
| `RETRIEVAL_HINTS_MIN` | `4` | 同上（Step 8.3） | `retrieval_hints` 最少条数，且必须含架构归属句 | 检索召回质量门槛 |
| `CONCEPT_INDEX_MIN_ENTRIES` | `15` | 同上（Step 6） | `_concept_index.md` 最少业务概念映射条数 | 解决"需求关键词与模块命名不匹配" |
| `SUBDOC_SPLIT_SMALL_MAX_FILES` | `5` | 同上（子文档拆分粒度） | 小模块（< 5 源文件）→ 1 个子文档 | 按职责边界而非文件数平均拆分 |
| `SUBDOC_SPLIT_LARGE_MIN_FILES` | `15` | 同上 | 大模块（> 15 源文件）→ 3–5 个子文档 | 同上 |

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `probe_codemap()` | `.claude/skills/code-index-builder/scripts/build_index.py` | Step 10/索引阶段的 Codemap 可用性探测，**不得**用"跳过探测直接生成"替代 |
| `get_graph_stats()` | Codemap MCP（外部） | Step 0-codemap 门禁，返回 `files`/`symbols`；失败即中止，不可降级 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 符号信息获取方式 | Codemap MCP 实时查询 | 离线 `_sigs.jsonl` + `_desc_context.md` 中间产物 | 实时查询与 Step 2–4 能力完全重叠，且中间产物会污染 Grep/检索，故 Step 2–4 整体移除；`_desc_context.md` 只允许落在 `build/` |
| Codemap 不可用时的行为 | 中止构建并提示启动 Codemap | 离线降级扫描 | Skill 明确要求 Codemap 可用，不支持离线降级（避免产出低质索引） |
| 知识库根目录判定 | 先看仓库根 `codeindex/` 是否存在，否则 `.codemaker/codeindex/` | 硬编码 `.codemaker/codeindex/` | 与 `paths.CodeIndexDir` 判定保持一致，避免产物写到不被检索的位置 |
| 模块 `kb_path` 推断 | 镜像源码路径（`<知识库根>/<src_path>`） | 按模块名扁平化 | 路径即契约，便于增量更新时按 `src_path` 反查 |

## 跨模块依赖

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `.claude/commands` | 用户执行知识库构建/更新类命令 | `code-index-builder` skill 触发词 |
| Codemap 索引器 | 每轮"为仓库生成增强提示词"批处理 | `enhance-prompts/_workspace.json`、本模块 Step 5 单模块模式 |

> 外部依赖（引用原因）：

| 依赖模块/系统 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| Codemap MCP | 提供 workspace.json 与全部符号信息，是 Step 0-codemap 门禁 | `get_graph_stats`, `search_code`, `get_symbol_detail` | extracted |
| `.codemaker/codemap/` | 消费上层预生成的 workspace.json（本模块禁止自行扫描） | `_workspace.json` | extracted |
| `openspec/` | 规格与设计文档的权威来源在此，知识库只引用不复写（来源: `openspec/specs/repo-hygiene/spec.md`） | `openspec/specs/**/spec.md` | extracted |

## 典型调用链

### 为新模块生成知识文档（本仓库 enhance-prompts 批处理路径）
```
用户/ephemeral prompt → code-index-builder SKILL.md 触发词命中
  → Step 0-codemap: get_graph_stats()                    ← 门禁：失败即中止
    → Step 1: 读取 workspace.json（上层预生成，禁止重扫）
      → Step 5: 逐模块产出 _overview.md + {module}_{sub}.md   ← 本子文档
        → Step 7: scripts/validate.py --coverage           ← 跨文件：格式与覆盖率校验
          → Step 8: 自检（三条硬约束：业务意图/变更风险/边界约束）
            → Step 9: 写 kb-config.json（必须落在知识库根一级）
```

### 增量更新（源文件变更后）
```
Step 0b-1 → scripts/diff_kb.py --sig-diff   ← 签名漂移 → 重写子文档
  → Step 0b-2 → diff_kb.py --new-syms       ← 新增符号 → 补入 entity_names.constants
    → Step 0b-3 → diff_kb.py --bug-rules    ← 边界规则缺失 → 补入实现约束清单
      → Step 0b-4 → diff_kb.py --arch-diff  ← 新增/删除模块 → 同步 _catalog.md/_index.md
```

## 变更风险

- **改动 frontmatter 字段名/结构 = 同时打断校验与检索**：`validate.py` 的 `OVERVIEW_REQUIRED = ['module_id','architectural_role']` 与 `SUBMOD_RECOMMENDED = ['entity_names','retrieval_hints','architectural_role']` 直接按字段名读取；改名后校验报错，而 `search_knowledge` 也依赖这些字段做切片召回，后果是**整个仓库知识库对代理不可见**（来源: `.claude/skills/code-index-builder/scripts/validate.py`）。
- **改动常量（如把 `RETRIEVAL_HINTS_MIN` 从 4 调到 1）会静默降低召回质量**：校验不会失败，但子文档会退化成"只列符号清单"，这正是 SKILL.md Step 8.3 明令禁止的形态。
- **把 `kb-config.json` 写到 `<知识库根>/<repo-name>/` 下会导致 `search_knowledge` 等知识库工具不可用**——SKILL.md Step 9 把这条标为 MUST 级错误，且该位置不会被 Codemap 识别。
- **在本模块内新增项目定制规程会被 `.gitignore` 吞掉**：`.claude/skills/code-index-*/` 被忽略，定制内容不入库、下次工具升级即丢失；定制应落到 `.codemaker/rules/` 或 `AGENTS.md`（来源: `.gitignore`）。

## 边界约束

- **能做**：修改 Step 5 的写作模板、补充新的质量门槛、为新模块类型增加拆分维度。**禁止**：把符号清单（classes/functions）写进文档——那由 Codemap 实时提供，重复列举会造成双源不一致（来源: `.claude/skills/code-index-builder/SKILL.md`）。
- **禁止**：在知识库产物中写入 `_desc_context.md`；该文件只允许落在 `build/`，混入后会 Grep 大量命中空行干扰检索（来源: SKILL.md Step 8.0）。
- **禁止**：在 Step 1 自行执行 Python 扫描脚本重建 `workspace.json`——workspace.json 由上层（codemap enhance）预生成，"agent 禁止执行任何 Python 扫描脚本"（来源: SKILL.md Step 1）。
- **禁止**：未经许可引用被点名的禁止数据源（`forbidden_sources`）；本次构建 `forbidden_sources=[]`，无限制，但该检查位必须保留（来源: SKILL.md Step 0a / 8.3）。
- **约束由来**：知识库的价值在于回答"改动会破坏哪些业务规则"，因此 Step 8.3 把"业务意图 / 变更风险 / 边界约束"三条列为缺一即重写的硬约束（来源: `.claude/skills/code-index-builder/SKILL.md`）。

## 附：内置文档摘要

本子文档的全部规程内容提炼自仓库内置文档 `.claude/skills/code-index-builder/SKILL.md`（1042 行）。此处只保留可执行约束与决策理由，未转录模板示例与命令细节。

> 📄 本节内容来源于仓库内置文档：`.claude/skills/code-index-builder/SKILL.md`（原文已提炼，非完整转录）

## 附：OpenSpec 摘要

- 规格与设计文档的**权威来源为 `openspec/`**，README/知识库不得成为第二权威源；因此本技能生成的模块文档只做"约束提炼 + 来源注记"，不复写规格全文（来源: `openspec/specs/repo-hygiene/spec.md`）。
- 每个 change **独立立项、独立验证**，范围不得越界实现其它 change 的能力——这决定了知识库的模块边界按 `src_path` 而非按"业务系统"切分，跨层系统需另建聚合文档（来源: `openspec/specs/change-roadmap/spec.md`）。
- 项目契约来源 `openspec/config.yaml`（`schema: spec-driven`）当前未配置 `context`/`rules`，即无额外注入约束。

> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/change-roadmap/spec.md`、`openspec/config.yaml`（仅提炼相关约束，非完整规范）
