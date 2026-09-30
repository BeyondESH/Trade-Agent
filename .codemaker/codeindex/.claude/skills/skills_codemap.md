---
type: "Fragment"
id: .claude/skills/codemap
title: "Agent 技能定义层 / Codemap 检索姿势"
description: "用 Codemap 图索引理解、调试、评估一段代码的正确姿势是什么？"
parent: /.claude/skills/_overview.md
fragment: codemap
entity_names:
  constants:
    - name: CYPHER_LIMIT_DEFAULT
      value: "50"
      source: .claude/skills/codemap-cypher-query/SKILL.md
    - name: CYPHER_LIMIT_MAX
      value: "500"
      source: .claude/skills/codemap-cypher-query/SKILL.md
    - name: CYPHER_VEC_DIM
      value: "384"
      source: .claude/skills/codemap-cypher-query/SKILL.md
    - name: CYPHER_TRAVERSAL_MAX_HOPS
      value: "5"
      source: .claude/skills/codemap-cypher-query/SKILL.md
    - name: CYPHER_STRING_TRUNCATE_CHARS
      value: "200"
      source: .claude/skills/codemap-cypher-query/SKILL.md
    - name: IMPACT_RISK_LOW_MAX_CALLERS
      value: "2"
      source: .claude/skills/codemap-impact-analysis/SKILL.md
    - name: IMPACT_RISK_MEDIUM_MAX_CALLERS
      value: "10"
      source: .claude/skills/codemap-impact-analysis/SKILL.md
    - name: CYPHER_BLOCKED_CLAUSES
      value: "CREATE, DELETE, SET, MERGE, DROP, DETACH, REMOVE"
      source: .claude/skills/codemap-cypher-query/SKILL.md
retrieval_hints:
  - "怎么定位一个陌生功能的入口代码？"
  - "改动某个函数会波及哪些调用方，风险多大？"
  - "统计类问题（有多少个函数/哪个类方法最多）该用什么工具？"
  - "⚠️ 如果你要找的是知识库构建流程（生成 codeindex），不在这里，在 skills_kb_builder.md"
  - "本族技能也叫「codemap MCP 使用规范 / 影响面分析 / 调用链追溯」，对应需求中的「先看图再动手」"
  - "新增代码检索类规程时，纪律应写进本族 SKILL.md 或 `AGENTS.md` 的 codemap 段，不要在 .claude/skills 下另建同名技能"
architectural_role: "Agent 技能定义层的代码理解纪律：规定'先图检索后读文件'的不可协商顺序"
---

## 业务意图

这四个技能解决的是**代理定位代码时的低效与误判**：没有它们时，模型倾向于反复 Grep + 全文件 Read，既慢又容易漏掉调用方，从而改坏代码。四个技能把这四种典型任务（探索陌生代码、追 Bug、改前评估影响面、结构统计）固化成"先查图、必要时才读文件"的查询序列，把 `AGENTS.md` 中"always use codemap MCP tools instead of Grep/Read"这句原则变成可执行步骤（来源: `AGENTS.md`、`.claude/skills/codemap-exploring/SKILL.md`）。

## 对外接口（工具契约）

| 技能 | 方向 | 使用的工具序列 | 业务说明 | 入口符号 |
|------|------|--------------|---------|---------|
| `codemap-exploring` | 会话→Codemap MCP | `search_code` → `find_symbol` → `get_symbol_detail(include_body)` → Read 邻居上下文 →（按需）`get_call_chain` | 理解陌生代码；**关系类问题才追调用链** | `codemap-exploring/SKILL.md` |
| `codemap-debugging` | 会话→Codemap MCP | `search_code`(症状文本) → `find_symbol` → `get_call_chain` → `get_dependencies` → `get_symbol_detail` | 追错误来源；codemap 结果不足时才读源文件 | `codemap-debugging/SKILL.md` |
| `codemap-impact-analysis` | 会话→Codemap MCP | `find_symbol` → `get_dependencies`（会坏的直接调用方）→ `get_call_chain`（下游）→ `get_type_hierarchy` | 改前评估爆炸半径，**先报风险再动手** | `codemap-impact-analysis/SKILL.md` |
| `codemap-cypher-query` | 会话→Codemap MCP | `query_cypher`（只读） | 计数/排名/聚合等 `search_code` 答不了的结构问题 | `codemap-cypher-query/SKILL.md` |

> 图 Schema 关键事实（Cypher 侧）：节点表 `Symbol`（PK `id` = `filepath:kind:scopedName`，含 `name`/`qual_name`/`kind`/`file_path`/`signature`/`doc_string`/`exported`/`body`）、`File`、`Embedding`（`vec FLOAT[384]`）；关系表 `CONTAINS`(File→Symbol)、`IMPORTS`(File→File)、`CALLS`、`INHERITS`、`IMPLEMENTS`、`HAS_CHILD`、`REFERENCES_SYM`、`DEPENDS_ON`。

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `CYPHER_LIMIT_DEFAULT` | `50` | `codemap-cypher-query/SKILL.md` | `query_cypher` 默认返回行上限 | 结果可能极大时必须显式带 `LIMIT` |
| `CYPHER_LIMIT_MAX` | `500` | 同上 | 工具硬上限，超出被截断 | 同上 |
| `CYPHER_VEC_DIM` | `384` | 同上 | 向量嵌入维度（`--embed` 构建后可用于语义检索） | 决定 `search_code` 混合检索能力 |
| `CYPHER_TRAVERSAL_MAX_HOPS` | `5` | 同上 | 多跳遍历上限 `[:EDGE_TYPE*1..5]` | 与 `get_call_chain` 的 depth 上限一致 |
| `CYPHER_STRING_TRUNCATE_CHARS` | `200` | 同上 | 超长字符串结果自动截断 | 阅读侧需知截断存在 |
| `IMPACT_RISK_LOW_MAX_CALLERS` | `2` | `codemap-impact-analysis/SKILL.md` | 直接调用方 0–2 → 风险 LOW，可安全改 | 风险分级表 |
| `IMPACT_RISK_MEDIUM_MAX_CALLERS` | `10` | 同上 | 3–10 → MEDIUM（需全部改）；>10 → HIGH（考虑弃用路径）；接口多实现 → CRITICAL | 同上 |
| `CYPHER_BLOCKED_CLAUSES` | `CREATE/DELETE/SET/MERGE/DROP/DETACH/REMOVE` | `codemap-cypher-query/SKILL.md` | 被禁写的 Cypher 子句 | 图索引只读，防把代码库改坏 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 结构统计走哪条路 | `query_cypher` 聚合 | 逐个 `find_symbol` 再人工计数 | 计数/排名类问题精确且一次到位，避免遗漏与 token 浪费 |
| 影响面分析产出什么 | 先输出风险等级 + 待改调用方清单，再动手 | 直接改代码 | 让"改坏"在动手前被看见 |
| 符号定位方式 | 名称优先；无模块前缀（`get_symbol_detail` 也接受 `Class::method` 等形态） | 强制符号 ID | 符号 ID 冗长难记，但歧义时仍可传 `symbol_id` 精确定位 |
| 读文件的时机 | 仅在 codemap 结果不足或需要编辑邻居上下文时 | 先读整个文件再查图 | 把 Codemap 当索引、文件系统当正文，减少无效读取 |

## 跨模块依赖

> 外部依赖：

| 依赖 | 引用原因 | 关键符号 | confidence |
|------|---------|---------|-----------|
| Codemap MCP server | 四个技能显式声明 `compatibility: Requires codemap MCP server`（cypher 版另需 `query_cypher` 工具） | `search_code`, `find_symbol`, `get_symbol_detail`, `get_call_chain`, `get_dependencies`, `get_type_hierarchy`, `query_cypher`, `search_knowledge` | extracted |
| `AGENTS.md`（codemap 段） | 定义全仓通用纪律（含 subagent 必须用 `general` 而非 `explore`） | 「Codemap MCP」节 | extracted |

> 反向调用方：

| 调用方 | 调用场景 | 关键符号 |
|-------|---------|---------|
| `skills_kb_builder.md`（Step 5） | 生成模块文档时按需拉符号详情与调用链 | `get_symbol_detail(include_body=true)`、`get_call_chain` |
| 任意业务代码任务（backend/frontend） | 需求实现前的定位与影响评估 | 四个技能的工作流步骤 |

## 典型调用链

### 改前影响面评估（本仓库最常见的安全路径）
```
用户"改 X 安全吗" → AGENTS.md codemap 纪律命中
  → codemap-impact-analysis → find_symbol(X)
    → get_dependencies(X)          ← 直接调用方 = 会坏的部分
      → get_call_chain(X, both)    ← 下游副作用
        → get_type_hierarchy(X)    ← 若为接口/基类
          → 风险分级（≤2 LOW / 3–10 MEDIUM / >10 HIGH）→ 报告后才编辑
```

### 计数类问题
```
"这个仓库有多少函数" → search_code/find_symbol 无法直接回答
  → AGENTS.md 指引：计数/聚合用 query_cypher
    → MATCH (f:File)-[:CONTAINS]->(s:Symbol) ... RETURN count(s) LIMIT 500
```

## 变更风险

- **修改任一技能的工具顺序**（例如把 `get_dependencies` 从影响分析流程里去掉）→ 代理会在不知道调用方的情况下改签名，直接产出编译期/运行期断裂；`AGENTS.md` 的兜底纪律也在提示这一后果。
- **提高 `CYPHER_LIMIT_MAX` 或去掉 `LIMIT` 约束**：聚合查询会把大量行灌进上下文，导致后续推理被噪声淹没，与本模块"降低定位成本"的意图相反（来源: `codemap-cypher-query/SKILL.md`）。
- **把 Codemap 结果原样大段打印到对话**：会挤占上下文并让文档生成退化；SKILL.md Step 5 明确要求"结果不打印，直接用于文档"（来源: `.claude/skills/code-index-builder/SKILL.md`）。
- **误用 subagent**：`explore` 类子代理不支持 MCP，无法调用 codemap 工具；需要子代理时必须用 `general`（来源: `AGENTS.md`）。
- **技能升级会被覆盖**：`.claude/skills/codemap-*/` 被 `.gitignore` 忽略、不入版本库，任何写进这四个 SKILL.md 的本仓库定制都不会留下；定制请写进 `AGENTS.md` 或 `.codemaker/rules/`（来源: `.gitignore`）。

## 边界约束

- **允许**：以只读方式查询图（`MATCH/WITH/RETURN/ORDER BY/LIMIT/WHERE/CALL`）。**禁止**：任何写子句（见 `CYPHER_BLOCKED_CLAUSES`）——由来：图索引是源码的派生物，写它等于伪造事实。
- **允许**：`search_code` 混合关键词+语义（`--embed` 建好后自动融合）。**禁止**：用宽泛的 `find_symbol` 前缀扫描代替精确检索——SKILL.md 规则"先用 search_code，而不是 broad find_symbol prefix"。
- **边界**：Codemap 不可用（连接失败或 `files=0`）时，知识库构建必须中止而不是离线降级；本族技能此时也无从执行，唯一动作是提示启动 MCP（来源: `.claude/skills/code-index-builder/SKILL.md` Step 0-codemap）。
- 若需回答业务规则/架构约束类问题，应先走 `search_knowledge`（读 `.codemaker/codeindex/`），把符号定位与规则查询分开（来源: `.claude/skills/code-index-builder/SKILL.md`「检索优先级」）。

## 附：内置文档摘要

- 调试侧的符号定位兜底顺序值得记住：**codemap 检索 → get_dependencies → get_call_chain → get_symbol_detail → 只有在前四步不足时才 Read 源文件**（来源: `.claude/skills/codemap-debugging/SKILL.md` Checklist）。
- 探索侧的收尾动作是"读实际文件获取邻居上下文再编辑"，即 Codemap 不取代 Read，只是把它压缩到最后一步（来源: `.claude/skills/codemap-exploring/SKILL.md`）。

> 📄 本节内容来源于仓库内置文档：`.claude/skills/codemap-exploring/SKILL.md`、`.claude/skills/codemap-debugging/SKILL.md`、`.claude/skills/codemap-impact-analysis/SKILL.md`、`.claude/skills/codemap-cypher-query/SKILL.md`、`AGENTS.md`（原文已提炼，非完整转录）
