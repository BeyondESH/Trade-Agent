---
name: code-index-builder
description: >
  【调用时机】用户明确要求"为某个代码仓库生成知识库"、"更新知识库"、"初始化 .codemaker/codeindex/"
  或"把这个仓库的代码知识沉淀下来"时调用。
  典型触发词：生成知识库、建知识库、更新 kb、增量更新知识库、为仓库做知识沉淀。

  【排除边界——以下情况不调用此 Skill】
  - 用户只是想查询/使用现有知识库（Codemap MCP 已内置搜索能力，无需额外 skill）
  - 用户提问与业务模块开发、Bug 修复、代码阅读有关（Codemap MCP 已内置检索能力）
  - 用户只是问"知识库里有没有 X"（直接使用 search_knowledge 工具）
tools:
  - extract_signatures (code-index-builder)
  - generate_desc (code-index-builder)
  - build_index (code-index-builder)
  - validate (code-index-builder)
  - diff_kb (code-index-builder)
---

# code-index-builder

## 本 Skill 的业务定位

**沉淀什么**：业务规则逻辑、系统架构约束、核心模块说明、标准化接口文档。  
**回答什么问题**：①"这个模块的业务意图是什么" ② "改动它会破坏哪些业务规则" ③ "对外契约长什么样"。  
**不沉淀什么**：符号定义、调用图、类层次（这些 Codemap MCP 实时提供）。

---

## 产物总览

```
<知识库根>/<repo-name>/                    ← 唯一产物根目录（仅放最终交付文件）
├── _project_overview.md           ← 仓库定位、技术栈、顶层目录结构
├── _architecture.md               ← 系统层次划分、模块边界、核心数据流
├── _core_systems.md               ← 核心子系统职责与关键流程
├── _catalog.md                    ← 全局多级目录索引（RAG 检索入口）
├── _concept_index.md              ← 业务概念 → 模块/文件 速查表
├── _index.md                      ← 全局架构索引（模块清单 + 依赖关系）
├── _systems/                      ← 跨层系统聚合文档（Step 6b，有 kb-systems.json 时生成）
│   ├── _index.md                  ← 系统清单
│   ├── behavior_tree.md           ← 行为树（client+server+editor 跨层聚合）
│   └── combat.md                  ← 战斗系统（client+server 跨层聚合）
└── {module_id}/                   ← 每个模块 = 仓库根一级子目录
    ├── _overview.md               ← 模块概览（源码路径、上下游关系）
    ├── {module_id}_{sub}.md       ← 子模块知识文档（entity_names、retrieval_hints）
    └── （符号索引由 Codemap 实时提供，无离线文件）

build/<repo-name>/                 ← 构建中间产物（不进入 .codemaker/codeindex/，不被检索）
└── {module_id}/
    └── _desc_context.md           ← 符号解读辅助表（Step 3 生成，Step 4 消费后废弃）
```

> ⚠️ `_desc_context.md` 只落在 `build/`，绝不写入 `.codemaker/codeindex/`（混入后 Grep 大量命中空行，干扰检索）。

**核心原则：** 模块数目标 10–20（< 10 自动 depth=2，> 20 默认全量生成，用户要求缩减时才询问）；传入叶子目录时以叶子层级作为模块边界，支持细粒度知识库生成；脚本只做机械操作，语义解读全交给 Agent；不生成冗余中间产物。

**检索优先级：** `_concept_index.md`（关键词直达子文档）> `_catalog.md`（模块列表）> 子模块文档章节（边界规则/约束）；符号定位由 **Codemap MCP** 实时提供。

---

## 执行流程

### Step 0-env：环境依赖自检 ⏭️ 已移除

> tree-sitter 仅用于 extract_signatures.py（Step 2），Step 2 已移除，本步骤不再执行。

---

### Step 0-codemap：探测 Code Graph MCP 可用性（每次构建前必做，幂等）

在 Step 0-env 完成后、Step 0-config 之前执行：

调用 `get_graph_stats()`：

| 结果 | 后续动作 |
|------|---------|
| 成功响应（返回文件数、符号数等统计） | 在 `workspace.json` 写入 `"codemap": "available"`；Step 2、Step 3、Step 4 **整体跳过**，直接进入 Step 5 |
| 连接失败 / 无响应 / `files=0` | **停止构建**，提示用户：Codemap 不可用，符号索引无法生成，请确认 Codemap MCP 已启动后重试 |

打印结果：
- `✅ Codemap 可用（N 个文件，M 个符号），Step 2–4 已跳过`
- `❌ Codemap 不可用，构建中止，请启动 Codemap MCP 后重试`

> 💡 Codemap 实时提供符号索引（`find_symbol` / `search_code` / `get_symbol_detail`），与 Step 2–4 功能完全重叠；可用时无需离线提取，Step 5 直接按需拉取符号信息生成文档。本 Skill **要求 Codemap 可用**，不支持离线降级模式。

---

### Step 0-config：读取 kb-config.json（可选，自动检测）

**先解析知识库根目录**（需与 `paths.CodeIndexDir` 判定一致，勿硬编码 `.codemaker/codeindex/`）：

- 先用 bash 检测仓库根下是否已存在 `codeindex/` 目录：存在 → 知识库根为 `codeindex/`（且若 `.codemaker` 是 symlink 也视为存在）
- 否则知识库根为 `.codemaker/codeindex/`
- 后续所有 `kb_path` 的前缀和 `kb-config.json` 的写入路径都以该根为基准

检查 `<知识库根>/kb-config.json` 是否存在：

**存在** → 读取并解析，每条 entry 格式：

```json
{ "kb_path": "<知识库根>/...", "src_path": "scripts/...", "description": "..." }
```

后续步骤中：
- 使用 `src_path` 替代交互式扫描得到的仓库路径
- 使用 `kb_path` 替代默认的 `<知识库根>/<repo-name>/` 作为知识库输出目录
- `description` 作为模块描述注入 `_project_overview.md`
- 若 config 中有多个 entry，**并行处理所有 entry**（每个 entry 作为独立的构建任务）
- **跳过 Step 0a 和 Step 1 的交互式路径询问**（路径已由 config 确定）

**不存在** → 按原有流程继续，并在每个模块生成完成后**自动推断并使用镜像路径**：
- 每个扫描到的模块（`src_path`）对应的知识库输出目录（`kb_path`）由以下规则推断：
  - `kb_path = "<知识库根>/" + src_path`（与源码路径保持一致的镜像结构）
  - 例：`scripts/client/inventory` → `<知识库根>/scripts/client/inventory`
  - 例：`src/combat/buff` → `<知识库根>/src/combat/buff`
- **全局文档**（`_project_overview.md` / `_architecture.md` / `_catalog.md` / `_index.md` / `_concept_index.md`）统一更新到 `<知识库根>/` 根目录（不放入子路径）
- 各模块子文档写入对应 `kb_path`

---

> 🛑 **需澄清时**：仓库路径不明时询问路径；用户主动要求缩减模块范围时询问方式；anti_patterns 互相矛盾时询问以哪条为准。

### Step 0a：询问人工知识库（预处理 · 首次必做）

```
ask_user_question(
  question = "是否有现成的人工编写知识库需要合入生成产物？",
  options  = ["有，我来提供路径", "没有，直接生成"],
  multiSelect = False
)
```

若"有"：读取文件识别模块归属（`module_id`/`doc_type`），暂存为 `manual_kb_map`；后续生成时对应模块优先用人工文档，产物末尾追加来源注记。若"没有"：直接进入 Step 0b。

**额外询问（禁止数据源）：**

```
ask_user_question(
  question = "是否有禁止引用的数据源？（如：codewiki、某内部 wiki、某旧知识库）",
  options  = ["没有禁止的数据源", "有，我来指定"],
  multiSelect = False
)
```

若"有"：追问具体名称，记录为 `forbidden_sources = ["codewiki", ...]`；
后续生成步骤中禁止在任何产物文档中出现该数据源的来源注记；Step 8.3 自检时 grep 验证。
若"没有"：`forbidden_sources = []`，不做限制。

---

### Step 0a-md：扫描仓库内置 Markdown 与 OpenSpec 文档（预处理 · 首次必做）

> 🔍 若仓库中存在 `.md` 文件，或能找到 `openspec/` 目录（仓库根或上级目录，最多上溯 3 层），视其为**内置文档**，应将内容合并入对应模块的产物知识库。

#### 扫描步骤

```bash
# 1. 列出仓库中所有 .md 文件（排除已解析出来的 <知识库根>、.git/、node_modules/）
find /path/to/repo -name "*.md" \
  ! -path "*/.codemaker/codeindex/*" ! -path "*/codeindex/*" ! -path "*/.git/*" ! -path "*/node_modules/*" \
  | sort

# 2. 查找 openspec/ 目录（优先仓库根，找不到则逐级上溯，最多上溯 3 层）
OPENSPEC_DIR=""
for dir in \
  "/path/to/repo/openspec" \
  "/path/to/repo/../openspec" \
  "/path/to/repo/../../openspec" \
  "/path/to/repo/../../../openspec"; do
  if [ -d "$dir" ]; then
    OPENSPEC_DIR=$(realpath "$dir")
    break
  fi
done

if [ -n "$OPENSPEC_DIR" ]; then
  echo "✅ 找到 openspec 目录：$OPENSPEC_DIR"
  find "$OPENSPEC_DIR" -type f | sort
else
  echo "⚠️ 未找到 openspec 目录（已上溯 3 层）"
fi
```

**openspec 目录定位策略（按优先级）：**

1. **仓库根 `/openspec`**：最优先，直接使用
2. **逐级上溯**：依次检查父目录 `../openspec`、`../../openspec`、`../../../openspec`，找到即停止
3. **仍未找到**：询问用户：

```
ask_user_question(
  question = "未在仓库目录及其上级目录（最多 3 层）中找到 openspec/ 目录，请选择处理方式：",
  options  = ["提供 openspec 目录的绝对路径", "跳过 openspec，不合并接口规范"],
  multiSelect = False
)
```

- 用户提供路径 → 使用该路径，记入 `repo_md_map.__openspec_dir__`
- 用户选择跳过 → `repo_md_map.__openspec__` 置为 `null`，自检报告注记 `[跳过 openspec]：用户确认无需合并`

#### 归属判断规则

| 文件路径示例 | 归属模块 | 处理方式 |
|------------|---------|---------|
| `README.md`（仓库根） | 全局 | 内容摘要追加至 `_project_overview.md` 的 `## 仓库定位` 节 |
| `ARCHITECTURE.md`（仓库根） | 全局 | 内容合并至 `_architecture.md` |
| `<module>/README.md` | 对应 `module_id` | 内容摘要追加至该模块 `_overview.md` 的 `## 模块概述` 节 |
| `<module>/DESIGN.md`、`<module>/docs/*.md` | 对应 `module_id` | 内容要点提炼后追加至最相关子文档末尾的 `## 附：内置文档摘要` 节 |
| `openspec/<module>.*`（文件名含模块关键词） | 对应 `module_id` | 提炼接口/协议定义，追加至对应模块最相关子文档的 `## 附：OpenSpec 摘要` 节 |
| `openspec/` 下无法匹配模块的文件 | 全局 | 提炼后追加至 `_architecture.md` 的 `## 外部接口规范` 节（不存在则新建） |
| 无法判断模块归属的 `.md` | 全局 | 追加至 `_project_overview.md` 末尾 |

#### OpenSpec 处理规则

> 适用于 `openspec/` 目录下所有格式文件（OpenAPI YAML/JSON、自定义协议 md 等）。

1. **识别格式**：
   - `.yaml` / `.yml` / `.json`：按 OpenAPI/Swagger 规范解析，提取 `paths`（接口路径）、`components/schemas`（数据模型）、`info.description`（模块描述）
   - `.md`：按普通文档处理，与普通内置 md 合并规则一致
2. **内容提炼**：每个接口只提取 `operationId`、`summary`、关键请求/响应字段；不转录完整 schema 定义
3. **归属匹配**：用文件名（去扩展名）与 `top_level_modules` 做模糊匹配（如 `openspec/combat.yaml` → `combat` 模块）；匹配失败则归全局
4. **追加节标题**：`## 附：OpenSpec 摘要`，位于对应子文档末尾；全局归属则追加至 `_architecture.md`
5. **来源注记**：
   ```
   > 📋 本节内容来源于 OpenSpec：`openspec/<文件名>`（仅提炼接口摘要，非完整规范）
   ```

#### 合并规则

1. **读取文件**：逐一 `Read` 每个 md 文件的完整内容。
2. **提炼要点**：不原样复制，只提取与架构、API、约束、决策相关的段落；去除纯示例/教程性内容。
3. **追加标注**：在被追加的知识库文档末尾写入来源注记：
   ```
   > 📄 本节内容来源于仓库内置文档：`<相对仓库根的路径>`（原文已提炼，非完整转录）
   ```
4. **优先级**：内置 md 文档优先级低于 Step 0a 中用户手动提供的人工知识库；若内容冲突，以人工知识库为准。
5. **跳过条件**：文件内容 < 50 字（空文档/占位符），或内容与代码签名高度重复（如自动生成的 API 文档），则跳过并在自检报告中注记 `[跳过内置文档] <路径>：<原因>`。

#### 暂存结构

将扫描到的 md 文件及 openspec 文件的归属存入 `repo_md_map`：

```python
repo_md_map = {
  "global": ["README.md", "ARCHITECTURE.md"],           # 归属全局文档
  "combat": ["combat/README.md", "combat/docs/buff.md"], # 归属模块（普通 md）
  "__openspec__": {                                      # openspec 专属分组
    "combat":  ["openspec/combat.yaml"],                 # 匹配到模块
    "global":  ["openspec/shared_types.yaml"],           # 未匹配，归全局
  },
  ...
}
```

后续 Step 5 生成模块文档、Step 6 生成全局文档时，**自动读取 `repo_md_map` 并将对应内容合并入产物**，无需再次手动触发。

---

### Step 0b：检测已有知识库

`<知识库根>/<repo-name>/` 不存在 → 直接进入 Step 1。存在 → 读取 `_index.md` 获取上次生成时间和模块清单，执行以下四项差异检查后再进入 Step 1（结果打印为 `## 知识库差异扫描报告`）。

#### 0b-1：签名一致性

```bash
python3 scripts/diff_kb.py /path/to/repo --kb-dir ./<知识库根>/<repo-name> --sig-diff
```

- 签名变化 → `[签名漂移]`，Step 5 重写子文档
- 符号已删除 → `[已删除符号]`，Step 5 从子文档中移除相关描述
- 文件路径变更 → `[路径变更]`，更新子文档中的 `source` 字段

#### 0b-2：新增符号/类/协议

```bash
python3 scripts/diff_kb.py /path/to/repo --kb-dir ./<知识库根>/<repo-name> --new-syms
```

- 源码有但子文档未覆盖 → `[新增符号]`，Step 5 补入对应子文档；若为常量则补入 `entity_names.constants`
- 新增协议函数（`C_`/`S_` 前缀） → 同步检查协议命名规约
- 新增 `STATE`/`STATUS`/`PHASE`/`STAGE` 常量 → 同步检查状态机规约

#### 0b-3：Bug/边界规则补录

```bash
python3 scripts/diff_kb.py /path/to/repo --kb-dir ./<知识库根>/<repo-name> --bug-rules
# 或手动定位近期修改的源文件：
find /path/to/repo/<module> -newer ./<知识库根>/<repo-name>/<module>/_overview.md \
  -type f \( -name "*.py" -o -name "*.cpp" -o -name "*.c" -o -name "*.lua" -o -name "*.ts" \)
```

对新源文件：扫描 `# BUG`/`// FIXME`/`// ⚠️`/`/* 必须 */` 等注释提取候选边界规则；未收录进 `## 实现约束清单` 的标记 `[边界规则缺失]`，Step 5 补入。

#### 0b-4：新增子模块/架构变更

```bash
python3 scripts/diff_kb.py /path/to/repo --kb-dir ./<知识库根>/<repo-name> --arch-diff --depth <上次深度>
```

- 新增目录 → `[新增模块]`，走完整流程（Step 2 → 8）
- 删除目录 → `[已删除模块]`，从 `_catalog.md`/`_index.md`/`_concept_index.md` 移除
- 源文件数增加 > 50% → `[架构膨胀]`，Step 5 重评估子文档拆分粒度

#### 一键全量四项检查

```bash
python3 scripts/diff_kb.py /path/to/repo --kb-dir ./<知识库根>/<repo-name> \
  --report ./build/<repo-name>-diff-report.md
```

#### 差异扫描报告格式

```
## 知识库差异扫描报告

### [签名漂移] N 条
- combat/buff.cpp:AddBuff — 参数从 `(Entity* e, int id)` 变为 `(Entity* e, int id, int stack)`

### [已删除符号] M 条
- combat/buff.cpp:RemoveBuffAll — 源码中已不存在，将从子文档描述中移除

### [路径变更] K 条
- sys/store.c → sys/daemon/store.c（文件已移动）

### [新增符号] P 条
- combat/buff.cpp:ClampBuffStack（新增函数）
- combat/buff_defs.h:BUFF_STATE_IMMUNE（新增常量，需补入状态机规约）

### [边界规则缺失] Q 条
- combat/buff.cpp:92 — // BUG: 叠加上限必须用 MAX_BUFF_STACK，不可硬编码 → 未收录进约束清单

### [新增模块] R 个
- src/rank — 首次发现，将走完整生成流程

### [已删除模块] S 个
- src/legacy_shop — 目录已删除，将从全局索引中移除

### [架构膨胀] T 个
- sys — 源文件数从 12 增至 29（+141%），建议重新评估子文档拆分

---
> 以上差异将在后续步骤中按需处理；无差异的模块保持缓存不变。
```

---

### Step 1：读取预生成的 workspace.json

> `workspace.json` 由 codemap enhance 在仓库根预先生成，agent **禁止执行任何 Python 扫描脚本**。

直接读取 `workspace.json`，关键字段：`scan_mode` / `top_level_modules` / `module_types` / `anti_patterns` / `cross_module_hints`。

---

### Step 2：提取符号签名 ⏭️ 已移除

> Codemap 实时提供等价能力，本步骤不再执行，也不生成 `_sigs.jsonl`。

---

### Step 3：生成 desc 上下文 ⏭️ 已移除

> Codemap `get_symbol_detail(include_body=true)` 直接返回签名 + 文档 + 实现体，本步骤不再执行，也不生成 `_desc_context.md`。

---

### Step 4：Agent 批量解读符号 desc ⏭️ 已移除

> Step 5 文档生成阶段直接按需调用 `get_symbol_detail` 拉取符号信息，无需预先批量解读。

**Codemap 不可用时执行（fallback）：**

（本步骤已移除，内容见上方"Step 4：Agent 批量解读符号 desc ⏭️ 已移除"）

---

### Step 5：Agent 逐模块生成知识库文档

> 🏷️ **命名先行（强制）**：写文档前先定 `architectural_role`（2–5 词中文，如"战斗 Buff 子系统"），全局保持一致。  
> 📌 `scoped_dirs` 非空时只生成覆盖范围内的模块，全局文档 front-matter 加 `scoped: true`。
> 💡 **单模块执行模式**：当 prompt 明确指定 `模块 src_path` 时，本步骤仅处理该模块。workspace.json 由上层预先提供，无需重新扫描。其余步骤（Step 0/1/6/7/8/9/10）全部跳过，由上层框架的其他任务负责。

读取 `workspace.json`（`top_level_modules` + `anti_patterns` + `cross_module_hints`），输出到 `<知识库根>/<repo-name>/`，每个模块生成两类文件。

#### 符号信息获取（Codemap MCP）

```
search_code({matches: ["<模块关键词>", "<子功能关键词>"]})
  → 找到入口符号列表（file + line + kind）

get_symbol_detail({symbol_name: "<入口符号>", include_body: true})
  → 获取签名 + doc + 实现体，理解函数逻辑

get_call_chain({symbol_name: "<入口符号>", direction: "both", depth: 2})
  → 理解调用关系，用于生成「典型调用链」和「跨模块依赖」

get_type_hierarchy({symbol_name: "<核心类>"})
  → 理解继承结构（如有）
```

> ❌ **Codemap 调用结果禁止完整打印到对话**——直接用于文档生成，避免冗余输出。

每个模块生成两类文件：

#### `{module_id}/_overview.md`

```markdown
---
type: "Module"
id: <module_id>
title: "<architectural_role 值>"
description: "<从模块概述第一句提取的一句话业务定位>"
module_id: <module_id>
architectural_role: "业务层"
world_model_hints:
  - "属于业务层，由 Gate 层触发"
upstream_modules:
  - module: gate
    confidence: extracted      # 来自 cross_module_hints 脚本扫描
downstream_modules:
  - module: aoi
    confidence: extracted
  - module: event_bus
    confidence: inferred       # Agent 推断，无直接 import 证据
---

## Files

### 源代码路径
- `<相对项目根的源码目录>`

### 知识库文档
- `<知识库根>/<repo>/<module>/_overview.md`（本文件）
- `<知识库根>/<repo>/<module>/<module>_<sub1>.md`

### 符号索引
- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `<module>_buff.md` | Buff 添加/移除/叠加逻辑 | AddBuff, RemoveBuff, BuffManager |
| `<module>_defines.md` | 所有状态码、限额常量定义 | MAX_BUFF_STACK, BUFF_STATE_FROZEN |

## 模块概述

**必须回答三点**（各占 1 句）：
1. **业务定位**：这个模块的业务意图是什么（不是"提供什么代码"，而是"解决什么业务问题"）
2. **业务上游**：谁触发/调用本模块（协议、事件、定时器还是主动查询）
3. **业务下游**：改动本模块会影响谁（直接影响的业务层级、界面、玩家体验等）

示例：
> 本模块负责 Buff 完整生命周期管理（申请、效果计算、状态维持、清空），确保玩家在战斗中的增益/减益效果准确一致。  
> 上游：战斗协议 `C_ADD_BUFF` 由网关路由至此；战斗结束时由 player 模块清空所有 Buff。  
> 下游：影响玩家属性计算（attr 模块）、UI 显示（ui/buff_indicator）、AOI 广播（aoi 模块通知周边）。

## 架构简析

> 对当前模块内部结构进行简要分析，回答"这个模块是怎么组织的"。

**分层结构（必填，单行格式，便于 MCP 注入）：** 协议层:`<file>` → 逻辑层:`<file>` → 数据层:`<file>`  
例：`C_ADD_BUFF 协议处理` → `buff_manager.cpp:Dispatch` → `buff_effect.cpp:Calculate`

其他可选内容（按实际填写，不适用的省略）：
> - **核心类/文件**：列出 2–5 个最重要的类或文件，每项一句话说明其角色
> - **关键数据流**：模块内最主要的数据流转路径（函数名链，不写代码）
> - **状态机/生命周期**（如有）：关键对象的状态转换概述
> - **扩展点/插件机制**（如有）：模块对外暴露的主要扩展方式

示例：
```
模块采用"协议入口 → Manager 调度 → 子系统执行"三层结构。
核心文件：`buff_manager.cpp`（Buff 生命周期管理）、`buff_defs.h`（状态码与限额常量）、`buff_effect.cpp`（效果计算）。
数据流：AddBuff → BuffManager::Dispatch → EffectCalc → AoiNotify。
Buff 存在三种状态：ACTIVE / COOLING / EXPIRED，由 `buff_manager` 统一驱动转换。
```

## 上下游关系
> `extracted` = 静态分析可信；`inferred` = Agent 推断待复核

...
```

#### `{module_id}/{module_id}_{sub}.md`

```markdown
---
type: "Fragment"
id: <module_id>/<sub>
title: "<architectural_role 值 / 子文档职责>"
description: "<retrieval_hints 第一条正向疑问句>"
parent: /<module_id>/_overview.md
fragment: <sub>
entity_names:
  constants:
    - name: MAX_BUFF_STACK
      value: "10"
      source: combat/buff/buff_defs.h
    - name: BUFF_STATE_FROZEN
      value: "3"
      source: combat/buff/buff_defs.h
retrieval_hints:
  - "Buff 是怎么添加的"
  - "如何移除一个 Buff"
  - "⚠️ 如果你找的是角色属性计算，不在这里，在 attr 模块"
architectural_role: "战斗子系统核心，禁止在 UI 层直接调用"
---

## 对外接口（如有协议/RPC/事件则必填，单行格式便于 MCP 检索）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `C_ADD_BUFF` | client→server | `iBuffId`(INT32), `iStack`(INT8) | 添加 Buff，受 MAX_BUFF_STACK 限制 | `buff_manager.cpp:HandleAddBuff` |
| `S_BUFF_EXPIRED` | server→client | `iBuffId`(INT32), `iRemainTime`(INT32) | Buff 即将过期通知，UI 倒计时 | `notify.cpp:NotifyBuffExpired` |

> 无协议时可省略此节，或填"本子模块无对外接口，仅供内部调用"。

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `aoi` | AddBuff 内部调用 AOI 广播通知周边 | `AoiNotifyNearby` | extracted |
| `event_bus` | 状态变化后发布事件 | `EventBus::Post` | inferred |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `player` | 角色死亡时清空 Buff | `RemoveAllBuff` |

## 典型调用链

> 1–3 条功能入口到本模块的调用路径（函数名链，不写代码）

### 添加 Buff
```
C_ADD_BUFF 协议处理 → gate/handle_cmd.c:HandleAddBuff
  → combat/buff_manager.cpp:AddBuff          ← 本模块入口
    → combat/buff_defs.h:MAX_BUFF_STACK      ← 本模块常量
    → aoi/notify.cpp:AoiNotifyNearby         ← 跨模块：AOI 广播
    → event_bus/event_bus.cpp:Post           ← 跨模块：事件发布
```

...
```

**书写规则：**
- `entity_names` **只保留 `constants` 分组**（classes / functions 由 **Codemap MCP** 实时提供，无需在文档中重复列举）；
  每项含 `name`、`source` 和 **`value`**（枚举值、宏值、类型编号、限额、比例等有业务含义的常量均需填写），例：
  ```yaml
  entity_names:
    constants:
      - name: GOODS_STATE_LOCKED
        source: module.h
        value: "4"
      - name: ASSET_FREEZE_TYPE
        source: module.h
        value: "910018952"
  ```
  > ⚠️ 漏掉 `value` → AI 自行猜测数值；漏掉某个常量 → AI 用内联字面量替代。两者都是高频遗漏根因。

- **`## 实现约束清单`（Implementation Checklist）**：与上方 `## 对外接口` 配对，本节为**接口约束补充**（需求-阶段细节、性能红线等）。每个含协议/存档/状态定义的子文档**必须包含**此节，以下四个子表格**按实际情况填写适用项，不适用的整块省略**，**每条约束保持单行可读**：

  ```markdown
  ## 实现约束清单

  > 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

  ### 必须定义的常量/枚举
  > 适用：模块内有状态码、类型编号、限额、比例等有业务含义的常量。
  | 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
  |-------|----|---------|------|---------------------|
  | `STATE_LOCKED` | `4` | `module.h` | 资源锁定中，不可再操作 | fix: 并发锁定导致重复扣款 #2341 |
  | `FREEZE_TYPE_DEPOSIT` | `910018952` | `module.h` | 资金冻结专用 type，退款时凭此解冻 | — |
  | `MAX_DAY_CNT` | `5` / `10`（高级） | `module.h` | 每日操作次数上限，不同等级不同 | 策划需求 v2.3 |
  | `COMPENSATE_PERC` | `30` ⚠️待定 | `module.h` | 违约补偿比例（%），策划未最终定案 | — |

  > `⚠️待定` 标记表示该数值尚未经策划确认，实现后需在 PR 中列出等待定案。

  ### 必须包含的协议字段
  > 适用：模块内定义了客户端→服务端命令（C_xxx）或服务端推送（S_xxx）。
  | 协议名 | 字段 | 类型 | 说明 |
  |--------|------|------|------|
  | `C_CREATE` | `iFlag` | `INT8` | 创建时的选项标志位 |
  | `C_REOPEN` | `iFlag` | `INT8` | **重新打开也支持此字段，不可因"与创建类似"而省略** |

  > ⚠️ 复用上架/创建逻辑的命令（如重上架、重试），如果也支持某字段，必须在此单独列出。

  ### 必须实现的函数
  > 适用：有明确调用顺序、互斥关系或不可被常量替代的关键函数。
  | 函数名 | 所在文件 | 说明 |
  |--------|---------|------|
  | `get_max_day_cnt()` | `module.c` | 返回每日上限（不同等级返回值不同），**不得用常量直接代替** |
  | `freeze_for_deposit()` | `module.c` | 冻结资金时须传专用 type 常量，否则退款时无法精准解冻 |

  ### 存档字段索引（不可裁减）
  > 适用：模块有持久化数据结构（如数组索引、字典 key 规范）。
  | 宏名/字段名 | idx 值 | 说明 |
  |------------|--------|------|
  | `RECORD_IDX_ASSET_SN` | `5` | 资产冻结流水号，退款/解冻流程依赖此字段 |

  > ⚠️ 所有字段索引必须完整列出，不得以"其余参考代码"跳过。退款、解冻、补偿等流程依赖索引正确性，遗漏字段会导致资产损失类 Bug。

  ### 设计决策（存在多种可行方案时必填）
  > 适用：实现时存在"两种方案均可"的分歧点，记录选型理由，防止下次自动实现时选错。
  | 决策点 | 选定方案 | 备选方案 | 选定理由 |
  |--------|---------|---------|---------|
  | 计数粒度 | per-key mapping | 单整数计数 | 支持"同一对象每日只能操作一次"校验；单整数只能校验总次数 |
  | 状态表示 | 独立状态码 `STATE_LOCKED=4` | 在属性字段中标记 | 独立状态码使状态机清晰，便于查询和 GM 工具展示 |
  ```

  **生成规则：**
  - 从 `anti_patterns` 提取"不可省略/必须/禁止"类约束；从 Codemap `search_code` 结果的公开常量自动填"必须定义的常量"
  - **`约束由来` 列**（新增）：从 `workspace.json` 的 `anti_patterns[*].why`（git blame commit subject）提取，无数据时写 `—`。约束由来是回答"为什么有这个约束"的关键，不可省略为空白。
	- **设计决策**（四类必须显式记录）：① 文件归属（集成到哪个已有文件）；② 存储粒度（per-key vs 全局计数）；③ 数值常量（不得内联字面量）；④ 其他"两种方案均可行"的分歧

- `retrieval_hints` **至少 4 条**：
  1. **正向疑问句**（≥1）：需求语言描述模块能做什么，如"玩家上架商品时如何触发价格校验？"
  2. **反向排除句**（有同名/近义系统时必填）：`"⚠️ 如果你要找的是 X，不在这里，在 <module_id>"`
  3. **业务别名句**（有多个民间叫法时必填）：`"本模块也叫 X / Y，对应需求中的「Z」"`
  4. **架构归属句**（需求会新增函数/文件时必填）：`"新增的 X 逻辑必须放在 <文件名>，不可新建独立文件"`
- `## 跨模块依赖`（必填）：两表——外部依赖（引用原因/关键符号/confidence）+ 反向调用方（调用场景/关键符号）；确无则填"无"
- `## 典型调用链`（有协议/事件入口时必填）：1–3 条函数名链，标注 `← 本模块入口` / `← 跨模块：<module>`
- 禁止复制原始代码，禁止写使用示例；`## Files` 节必须填写

---

### Step 6：生成全局索引和综合文档

#### `_index.md`

```bash
python3 scripts/build_index.py ./<知识库根>/<repo-name>
```

#### `_catalog.md`（全局多级目录索引，RAG 入口）

> **精简原则**：`_catalog.md` 是纯导航表，只提供"模块名 → 一句话职责 → 文档路径"三列，不写源码路径、符号数等细节（详细内容在各模块 `_overview.md`）。Agent 靠此表快速选定目标模块，再进入对应文档。

```markdown
# <repo-name> 知识库目录

> 按模块名或职责关键词定位，找到后进入对应 `_overview.md` 阅读详情。
> 业务概念检索请优先查 `_concept_index.md`（关键词 → 子文档直达）。

## 模块索引

| 模块 | 一句话职责 | 概览文档 |
|------|-----------|---------|
| `<module_id>` | <模块核心职责，≤ 20 字> | `<知识库根>/<repo>/<module>/_overview.md` |
| `<module_id2>` | <模块核心职责，≤ 20 字> | `<知识库根>/<repo>/<module2>/_overview.md` |
```

#### `_concept_index.md`（业务概念 → 模块/文件 速查表，**必须生成**）

这是解决"需求关键词与模块命名不匹配"问题的核心产物。Agent 在 Step 1 定位模块时**优先查此文件**，避免靠模块目录名猜测业务概念。

**生成规则与质量门槛（严格）：**
- 遍历所有子模块文档的 `retrieval_hints`、`architectural_role` 提取高频业务词
- 每个业务概念对应 1–3 个最相关条目，精确到子文档路径（`{module}/{module}_{sub}.md`）和关键符号名，不只停在 `module_id`
- **覆盖"名称易混淆"的系统**（如多个模块都含"商城""交易""仓库"等词，必须在此区分）
- **条目宁多勿少，至少 15 条**；每行必须包含 **5 列且全部填齐**（少一列即视为不合格）
- **每行自包含完整业务点**（MCP 注入时以行为单位检索，跨行信息会被打散）

```markdown
# <repo-name> 业务概念索引

> 按需求关键词直查，找到 module_id 后再读对应的 _overview.md。
> **每行都是独立可检索的业务映射**，避免跨行拼读。

| 业务概念/需求关键词 | module_id | 子文档 | 关键符号 | 一句话说明 |
|------------------|-----------|--------|---------|-----------|
| 寄售/藏宝阁/CBG | sys | `sys/sys_trade.md` | `CreateDeposit`, `SettleDeposit` | 寄售交易核心逻辑，含定金、锁定、结算 |
| 摆摊/上架/下架 | xyqs/cmd | `cmd/cmd_store.md` | `PutOnShelf`, `TakeOffShelf` | 玩家个人摆摊与商品上下架 |
| 仙玉支付/付费购买 | xyqs/xianyu | `xianyu/xianyu_pay.md` | `DeductXianyu` | 仙玉扣费与负值保护 |
| 付费商城/至宝阁 | xyqs/zbg | `zbg/zbg_core.md` | `BuyZbgGoods` | 仙玉购买稀有商品的付费商城 |
| 收藏/心愿单 | xyqs/nichangbaoge | `nichangbaoge/ncbg_wishlist.md` | `AddWishlist` | 商城商品收藏与上架通知 |
```

> **增量维护要求（重要）**：每次需求实现完成后，若发现"关键词 → 模块"有新映射（需求期间靠 Grep 或多次试错才找到的路径），**必须补充到此文件**，供下次直接命中。

#### `_project_overview.md` / `_architecture.md` / `_core_systems.md`

参考 code-index-generator 同名文档格式生成。

**_architecture.md 额外建议（强化业务约束）：** 在模块概览之后新增可选节 `## 系统架构约束`，每条约束单行（便于 MCP 注入检索）：
```
## 系统架构约束

- [跨模块禁忌] UI 层禁止直接调用 combat::AddBuff，必须经 gate/handle_cmd 路由 → 确保协议校验与安全检查生效
- [数据流方向] 玩家属性变更必须 Player → AttrManager → AoiNotify，不可逆 → 违反会导致多端数据不同步
- [性能红线] AOI 广播半径 ≤ 50m，超出必须走异步队列 event_bus::PostAsync → 否则帧率下降
```

> 💡 **跨模块调用约束**：不生成全局 `_conventions.md`。如确有必要，将模块间调用禁忌、持久化规约、状态机规约等内容写入对应模块文档——跨模块调用禁忌放入相关子文档的 `## 跨模块依赖` 节，持久化/状态机/命名规约放入 `## 实现约束清单`。

---

### Step 6b：生成跨层系统聚合文档（可选，有 kb-systems.json 时自动触发）

> 适用场景：一个业务系统（如行为树、战斗、AOI）代码**分散在 client / server / editor 多个目录**，
> 当前按目录建模的知识库将其拆散，难以整体理解和增量维护。

#### 配置文件：`<知识库根>/kb-systems.json`

```json
{
  "systems": [
    {
      "id": "behavior_tree",
      "name": "行为树",
      "modules": [
        "scripts/client/bt",
        "scripts/server/bt",
        "scripts/editor/bt_tool"
      ],
      "description": "客户端表现层 + 服务器决策层 + 编辑器配置层"
    },
    {
      "id": "combat",
      "name": "战斗系统",
      "modules": ["scripts/client/combat", "scripts/server/combat"],
      "description": "客户端效果表现 + 服务器权威计算"
    }
  ]
}
```

> 💡 `modules` 填写 `src_path`（与 `kb-config.json` 中 `src_path` 保持一致），
> 支持**尚未在 kb-config.json 中存在的路径**（此时跳过该层，仅汇总已生成的模块）。

#### 执行

```bash
python3 scripts/build_systems.py ./<知识库根>/<repo-name> --config <知识库根>/kb-systems.json
```

脚本对每个 system entry：
1. 读取各 `modules` 对应的 `_overview.md`（取 `## 模块概述` 首段 + `## 架构简析` 概要）
2. 调用 Codemap `search_code` 提取各模块公开入口符号
3. 由 Agent 汇总生成 `<知识库根>/<repo-name>/_systems/<id>.md`

#### 产物格式：`_systems/<id>.md`

```markdown
---
system_id: behavior_tree
system_name: 行为树
layers:
  - layer: client
    src_path: scripts/client/bt
    kb_path: <知识库根>/<repo>/scripts/client/bt
  - layer: server
    src_path: scripts/server/bt
    kb_path: <知识库根>/<repo>/scripts/server/bt
  - layer: editor
    src_path: scripts/editor/bt_tool
    kb_path: <知识库根>/<repo>/scripts/editor/bt_tool
---

## 系统概述

> 2–4 句话：跨层视角描述整个系统的业务定位与价值（不重复各层 _overview.md）。

## 跨层数据流

> 说明 client / server / editor 三层之间的主要协作路径（函数名链或伪代码，不写完整代码）。

示例：
```
编辑器导出配置 → bt_tool/export.py:ExportBtConfig
  → 服务器加载 → server/bt/bt_loader.py:LoadBtConfig    ← 服务器决策层
    → 决策结果广播 → server/bt/bt_runner.py:BroadcastAction
      → 客户端接收 → client/bt/bt_renderer.py:PlayAction  ← 客户端表现层
```

## 各层入口速览

| 层次 | 核心入口 | 文件 | 说明 |
|------|---------|------|------|
| client | `PlayAction` | `client/bt/bt_renderer.py` | 播放行为树动作表现 |
| server | `RunBtTick` | `server/bt/bt_runner.py` | 驱动行为树决策帧 |
| editor | `ExportBtConfig` | `editor/bt_tool/export.py` | 导出行为树配置 |

## 各层知识库链接

| 层次 | 概览文档 | 符号索引 |
|------|---------|---------|
| client | [`client/bt/_overview.md`](../scripts/client/bt/_overview.md) | Codemap MCP |
| server | [`server/bt/_overview.md`](../scripts/server/bt/_overview.md) | Codemap MCP |
| editor | [`editor/bt_tool/_overview.md`](../scripts/editor/bt_tool/_overview.md) | Codemap MCP |

> 📌 本文件由 `build_systems.py` 自动聚合生成，**不重复源码细节**，仅作跨层导航。
```

#### _systems/_index.md（系统清单）

```markdown
# 跨层系统清单

| 系统 | 描述 | 涉及层次 | 聚合文档 |
|------|------|---------|---------|
| 行为树 | 客户端表现 + 服务器决策 + 编辑器配置 | client / server / editor | `_systems/behavior_tree.md` |
| 战斗系统 | 客户端效果 + 服务器权威计算 | client / server | `_systems/combat.md` |
```

#### _concept_index.md 联动

Step 6b 完成后，自动将跨层系统名称写入 `_concept_index.md`，指向 `_systems/<id>.md`，
使 search_knowledge 在首轮检索即可命中跨层系统条目，无需逐层检索。

#### 增量维护

增量更新时，若任一关联模块触发重新生成，则自动重新执行 Step 6b 对应的 system 聚合
（`build_systems.py --incremental --system <id>`），其他 system 保持缓存不变。

---

### Step 7：校验

```bash
python3 scripts/validate.py ./<知识库根>/<repo-name>
```

---

### Step 8：完成后自检（必做，不可跳过）

#### 8.0 中间产物污染检查（优先级最高）

```bash
find ./<知识库根>/<repo-name> -name "_desc_context.md"
# 有输出则立即删除：find ./<知识库根>/<repo-name> -name "_desc_context.md" -delete
```

#### 8.1 模块覆盖完整性

每个模块必须有：`_overview.md` / 至少一个 `{sub}.md`

#### 8.2 全局文件完整性

| 文件 | 必填章节 |
|------|---------|
| `_project_overview.md` | `## 仓库定位`、`## 技术栈`、`## 顶层目录结构` |
| `_architecture.md` | `## 系统层次划分`、`## 模块边界规则`、`## 核心数据流` |
| `_core_systems.md` | `## 子系统列表`、`## 关键流程描述` |
| `_index.md` | `kb_path` 元数据、模块清单表 |
| `_catalog.md` | 所有 `top_level_modules` 对应条目 |
| `_concept_index.md` | 至少 5 条业务概念映射，覆盖"名称易混淆"的系统 |

#### 8.3 子文档质量自检（三项硬约束优先，不通过即回退重写）

> **以下三条是普适硬约束**，对任何项目类型都成立，缺一条则子文档不合格：
> 1. **业务意图**：子文档正文必须说清"这个模块解决什么问题"（≥ 1 句，非"提供什么代码"）
> 2. **变更风险**：至少 1 处说明"改动它会破坏什么"，含后果描述（来源：anti_patterns / 跨模块依赖 / 接口契约）
> 3. **边界约束**：至少 1 处说明"什么能做、什么禁止"，含约束由来或后果（来源：实现约束清单 / 设计决策）

- [ ] 仓库内置 md 文档已扫描，`repo_md_map` 中每个文件已合并（或标注跳过原因）；合并节末尾含 `📄 本节内容来源于仓库内置文档` 注记
- [ ] 若存在 `openspec/` 目录：`repo_md_map.__openspec__` 已填充；每个 openspec 文件已追加至对应子文档的 `## 附：OpenSpec 摘要` 节或全局 `_architecture.md`；来源注记含 `📋 本节内容来源于 OpenSpec`
- [ ] `entity_names.constants` 每项含 `name`+`source`+`value`；**STATE/STATUS/PHASE 类常量全量列出**（classes/functions 由 Codemap 实时提供，无需在文档中列举）
- [ ] `retrieval_hints` ≥ 4 条（含架构归属句）；`architectural_role` 非空；正文 ≥ 100 字；无大段代码块
- [ ] 含协议/存档/状态的子文档：有 `## 实现约束清单`，适用子表已填；有分歧点时 `### 设计决策` 显式列出
- [ ] 每个子文档：`## 跨模块依赖` 两表存在（确无则填"无"）
- [ ] 有协议/事件入口的子文档：`## 典型调用链` 存在，≥ 1 条，标注跨模块边界
- [ ] `_overview.md`：`## 子文档速览` 表存在，"关键实体"列非空
- [ ] `_overview.md`：`## 架构简析` 节存在且正文 ≥ 30 字；至少描述分层结构或核心文件之一；不含大段代码块
- [ ] **源文件覆盖率**：所有源文件至少被一个子文档覆盖（在正文或"文件组成"表中提及）；遗漏文件必须补入已有子文档或新建子文档。
      检查命令：`python3 scripts/validate.py --coverage ./<知识库根>/<repo>/<module>`
- [ ] **禁止数据源检查**：若用户在本次构建前明确禁止引用某数据源（如 codewiki），
      所有子文档及 `_overview.md` 中不得出现该来源注记（如"本节摘自 codewiki"）；
      上下文压缩后无法区分信息来源时，**必须重新读取源码**而非凭记忆生成。
      `forbidden_sources` 由 Step 0a 收集，自检时逐文档 grep 确认无相关注记。
- [ ] **业务名称准确性**：`_catalog.md` / `_overview.md` / `_concept_index.md` 中的业务名
      （活动名 / 系统名 / 赛事名等）必须与源码中的注释或字符串字面量一致；
      不得凭推测生成近音 / 近形错别字。校验：将候选业务名 grep 源码至少命中 1 次。
- [ ] **信噪比检查**（防退化）：子文档业务性内容（约束/决策/风险/调用链正文）字数 ≥ 结构性清单（常量表/接口表）字数。
      失衡说明文档退化为常量清单，需补充业务上下文。

#### 8.3.1 desc 覆盖率检查 ⏭️ 已移除

> 符号索引由 Codemap 实时提供，无 `_sigs.jsonl`，此项检查不适用。

#### 8.4 自检报告

```
## 知识库自检报告

### ✅ 已完成模块（N 个）
- module_a, module_b, ...

### ⚠️ 本次补充/修复（M 项）
- [补充] module_c/_overview.md
- [修复] _catalog.md — 同步新增模块

### ⚠️ 生成警告（如有）
- [desc 跳过] module_x：已移除，Codemap 实时提供符号信息
- [inferred 关系] module_y：downstream_modules 中 2 条为推断关系，建议人工复核
- [符号缺失] module_z：Codemap 未返回任何符号，请检查 Codemap 索引是否包含该模块

### ❌ 已知限制（如有）
- module_d 源码目录为空，暂无可提取内容

### 📊 知识库质量指标（Agent 定位效率参考）
- _concept_index.md 条目数：N 条（< 5 条视为不合格）
- build/ 中间产物隔离：✅ .codemaker/codeindex/ 中无 _desc_context.md
- Codemap 状态：可用 ✅（符号实时提供）
- 源文件覆盖率：已覆盖 / 未覆盖文件列表（来自 `validate.py --coverage`）
- 禁止数据源检查：forbidden_sources=[] 无限制 / 已验证无 <name> 来源注记
- 业务名称 grep 验证：N 个业务名已验证命中源码 / M 个未命中（需人工核对）
- 置信度分布：
  - extracted（静态分析可信）：A 条依赖关系
  - inferred（Agent 推断，标有 [推断]）：B 条，建议人工复核
- 跨模块依赖覆盖率：N 个子文档已填写 `## 跨模块依赖`（< 100% 需说明原因）
- 典型调用链覆盖率：N 个有协议入口的子文档已填写 `## 典型调用链`
```

---

### Step 9：写入 kb-config.json

> 自检通过后，**无论初始是否存在 `<知识库根>/kb-config.json`，都自动写入（存在时覆盖更新）**。

写入内容为本次所有处理模块的条目数组：

```json
[
  {
    "kb_path": "<知识库根>/scripts/client/inventory",
    "src_path": "scripts/client/inventory",
    "description": "<模块 _overview.md 中 ## 模块概述 的首句>"
  },
  ...
]
```

- `description` 取对应模块 `_overview.md` 中 `## 模块概述` 节的**第一句话**（不超过 80 字）
- 若模块无 `_overview.md`，`description` 填 `""`
- > ⚠️ **MUST**：写入路径必须是「知识库根」的**一级根**下的 `kb-config.json`（知识库根按 Step 0-config 解析：根目录存在的 `codeindex/` 或 `.codemaker/codeindex/`），与知识库产物是否有 `<repo-name>` 子目录**无关**。
  >
  > **正确**（根目录已存在 `codeindex/`）：`codeindex/kb-config.json`
  >
  > **正确**（否则）：`.codemaker/codeindex/kb-config.json`
  >
  > **错误（禁止）**：`<知识库根>/<repo-name>/kb-config.json` —— 此位置不会被 Codemap 识别，会导致 `search_knowledge` 等知识库工具不可用。
  >
  > 即使本次产物组织在 `<知识库根>/<repo-name>/...` 子目录下，`kb-config.json` 本身也**不能**放进子目录；它必须落在知识库一级根，条目内的 `kb_path` 字段才用于指向子目录下的具体模块。

---

### Step 10：增强 Codemap 词义索引（Codemap可用时）

检查 `.codemap/symbol-words.csv` 是否存在（这是隐藏文件，需要用bash命令查看）：不存在则跳过；存在则读取内容，按以下逻辑处理：

- **无 `description` 列** → 新增该列，为每个 `word` 填写 ≤15 词中英文描述（聚焦代码函数名中的含义），胶水词（`to`/`of`/`a`/`s` 等无语义词根）留空，覆盖写回。
- **已有 `description` 列** → 检查是否有空值行：有则仅补充空值行后写回；全部已填则**跳过写回**，直接执行 `codemap import-summaries`。

保持行列顺序不变：

```csv
# 原格式            →   覆盖后格式
rank,word,count         rank,word,count,description
1,symbol,123            1,symbol,123,标识符或语法符号的抽象 Symbol token in code, e.g. function or variable name
2,node,98               2,node,98,树或图中的节点元素 Node in data structures like trees or graphs
3,graph,76              3,graph,76,表示关系的节点与边结构 Graph of nodes and edges
```

文件检查无误后执行，并**等待完成**：

```bash
codemap import-summaries
```

---

## 增量更新

1. 读取 `_index.md` 获取上次生成时间和模块列表
2. 调用 `get_graph_stats()` 确认 Codemap 仍可用
3. `_catalog.md` / `_index.md` 同步追加新模块条目
4. 执行 Step 8 自检
5. 输出**变更摘要**：

```
## 增量更新变更摘要

### ✅ 新增模块（N 个）
- module_x：首次生成全套产物

### 🔄 重新生成（M 个，源文件有变化）
- module_y：_overview.md 重写

### ⏭️ 跳过（K 个，缓存命中 / 无变化）
- module_a, module_b, ...

### 📊 增量后质量指标
- inferred 关系数：N 条（新增 M 条）
```

---

## 子文档拆分粒度

| 模块规模 | 推荐子文档数 | 拆分维度示例 |
|---------|------------|------------|
| 小模块（< 5 个源文件） | 1 个 | `{module}_core.md` |
| 中模块（5-15 个源文件） | 2-3 个 | `_data.md` / `_logic.md` / `_event.md` |
| 大模块（> 15 个源文件） | 3-5 个 | 按子功能域拆分，每个聚焦单一职责 |

**拆分原则：**
- 优先按**职责边界**拆分，不按文件数平均
- 每个子文档的 `entity_names.constants` 不重叠（同一常量仅在其定义所在子文档中列出）
- 常量集中的文件单独提取为 `_defines.md`

---

## 字段速查

| 字段 | 所在文件 | 作用 |
|------|---------|------|
| `top_level_modules` | `workspace.json` | 模块边界目录列表（粒度依扫描模式不同） |
| `scan_mode` | `workspace.json` | 扫描模式：`depth-N` / `auto-leaf` / `leaf-dirs` |
| `leaf_dirs_input` | `workspace.json` | `--leaf-dirs` 原始输入路径列表（用于复现扫描） |
| `anti_patterns` | `workspace.json` | 强制约束注释，汇总进 `_conventions.md` |
| `cross_module_hints` | `workspace.json` | 跨模块 import 摘要，用于生成上下游关系 |
| `module_id` | `_overview.md` frontmatter | 模块唯一标识符 |
| `architectural_role` | `_overview.md` / `{sub}.md` | 模块架构角色（一句话） |
| `world_model_hints` | `_overview.md` | 架构位置描述 |
| `upstream_modules` | `_overview.md` | 依赖我的模块 |
| `downstream_modules` | `_overview.md` | 我依赖的模块 |
| `entity_names` | `{sub}.md` | **仅含 `constants` 分组**（classes/functions 由 **Codemap MCP** 实时提供）；每项含 name+source+value |
| `retrieval_hints` | `{sub}.md` | 典型用户问法，帮助 RAG 召回 |
| `confidence` | `_overview.md` upstream/downstream | `extracted`=静态分析可信；`inferred`=Agent 推断待复核 |
| `## 子文档速览` | `{module}/_overview.md` | 子文档 → 覆盖内容 → 关键实体 三列导航表，Agent 选子文档的入口 |
| `## 跨模块依赖` | `{module}_{sub}.md` | 本子模块的外部依赖 + 反向调用方两表，实现功能时确定需改哪些模块 |
| `## 典型调用链` | `{module}_{sub}.md` | 协议/事件入口 → 本模块函数的完整调用路径，标注跨模块边界 |
| `parser` | `workspace.json` | ~~已移除~~（tree-sitter 仅用于已删除的 Step 2） |
| `forbidden_sources` | 运行时上下文 | Step 0a 收集的禁止引用数据源列表，Step 8.3 自检时验证 |
| `system_id` | `_systems/<id>.md` frontmatter | 跨层系统唯一标识符 |
| `layers` | `_systems/<id>.md` frontmatter | 各层 layer / src_path / kb_path 清单 |