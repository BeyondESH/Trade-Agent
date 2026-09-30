---
type: "Fragment"
id: .claude/skills/kb_scripts
title: "Agent 技能定义层 / 知识库脚本工具链"
description: "知识库构建的六个脚本分别负责什么、怎么调用、阈值在哪？"
parent: /.claude/skills/_overview.md
fragment: kb_scripts
entity_names:
  constants:
    - name: EXTRACTOR_VERSION
      value: "2.0"
      source: .claude/skills/code-index-builder/scripts/extract_signatures.py
    - name: MAX_FILE_BYTES
      value: "524288"
      source: .claude/skills/code-index-builder/scripts/extract_signatures.py
    - name: DESC_TOP_N
      value: "100"
      source: .claude/skills/code-index-builder/scripts/generate_desc.py
    - name: DESC_MAX_EXAMPLES
      value: "5"
      source: .claude/skills/code-index-builder/scripts/generate_desc.py
    - name: DESC_MIN_WORD_LEN
      value: "2"
      source: .claude/skills/code-index-builder/scripts/generate_desc.py
    - name: DIFF_SOURCE_EXTS
      value: ".py .c .h .cpp .hpp .hh .cxx .cc .js .ts .jsx .tsx .lua .java .go .rs .cs .rb .swift .kt"
      source: .claude/skills/code-index-builder/scripts/diff_kb.py
    - name: DIFF_SKIP_DIRS
      value: ".git .hg .svn node_modules __pycache__ .venv venv env .env dist build .idea .vscode .cache"
      source: .claude/skills/code-index-builder/scripts/diff_kb.py
    - name: VALIDATE_OVERVIEW_REQUIRED
      value: "module_id, architectural_role"
      source: .claude/skills/code-index-builder/scripts/validate.py
    - name: VALIDATE_SUBMOD_RECOMMENDED
      value: "entity_names, retrieval_hints, architectural_role"
      source: .claude/skills/code-index-builder/scripts/validate.py
    - name: VALIDATE_CODE_BLOCK_MAX_LINES
      value: "50"
      source: .claude/skills/code-index-builder/scripts/validate.py
    - name: STUB_SCAN_EXIT_CODE
      value: "0"
      source: .claude/skills/code-index-builder/scripts/scan_repo.py
    - name: TREE_SITTER_PIN
      value: "tree-sitter~=0.21.0 / tree-sitter-languages~=1.10.0"
      source: .claude/skills/code-index-builder/requirements.txt
retrieval_hints:
  - "知识库校验脚本怎么跑？哪些字段缺失会直接报错？"
  - "增量更新时怎么知道哪些模块的签名漂移了、哪些符号新增了？"
  - "为什么 scan_repo.py 什么都不做就退出？"
  - "⚠️ 如果你要找的是构建流程的 Step 顺序和产物契约，不在这里，在 skills_kb_builder.md"
  - "⚠️ 如果你要找的是交易后端/前端的测试脚本（backend/tests、frontend/scripts），不在这里，在对应源码模块"
  - "知识库产物目录结构相关的脚本逻辑也叫「codeindex 工具链 / diff_kb 差异报告」"
architectural_role: "Agent 技能定义层的机械执行层：只做扫描/校验/聚合，不做语义解读"
---

## 业务意图

这组脚本把知识库里**可机械判定的部分**（有没有 frontmatter、字段齐不齐、签名变没变、文件覆盖没覆盖）做成可重复执行的门禁，从而让"知识库是否可信"不依赖人的自觉；而**语义解读**（这个模块的业务意图是什么、改动会破坏什么）全部留给 Agent。这条分工是脚本设计的唯一出发点："脚本只做机械操作，语义解读全交给 Agent；不生成冗余中间产物"（来源: `.claude/skills/code-index-builder/SKILL.md`）。

## 对外接口（命令行契约）

| 脚本 | 调用形态 | 关键参数 | 业务说明 |
|------|---------|---------|---------|
| `build_index.py` | `python3 scripts/build_index.py <知识库根>` | `--dry-run`、`--skip-sigs`、`--workspace <json>` | 读取各模块 `_overview.md` frontmatter，生成 `_index.md`（模块清单 + 依赖关系） |
| `validate.py` | `python3 scripts/validate.py <知识库根>` | `--coverage`、`--script-root` | 校验文档契约：必填字段、必需章节、正文长度、代码块规模、源文件覆盖率 |
| `diff_kb.py` | `python3 scripts/diff_kb.py <repo> --kb-dir <dir>` | `--sig-diff`、`--new-syms`、`--bug-rules`、`--arch-diff`、`--report`、`--depth 1\|2` | 四项差异检查，输出「知识库差异扫描报告」，驱动 Step 0b 增量决策 |
| `extract_signatures.py` | *（SKILL.md Step 2 已移除）* | `--kb-output`、`--incremental`、`--diff-output`、`--workers`、`--codemap-check` | 保留为兼容工具；正常构建路径**不再调用**，符号索引改由 Codemap 实时提供 |
| `generate_desc.py` | `python3 scripts/generate_desc.py <kb_path> --prepare\|--finalize` | `--modules`、`--single`、`--force` | 词频切分生成 `_desc_context.md`（仅允许落 `build/`）与 `_grep_hints.txt` |
| `scan_repo.py` | 任意参数 | — | **存根**：直接 `sys.exit(0)`；workspace.json 已由 Codemap 预生成 |

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `EXTRACTOR_VERSION` | `2.0` | `extract_signatures.py` | 签名提取器版本，影响 `_sigs.jsonl` 兼容性 | 缓存复用需按版本失效 |
| `MAX_FILE_BYTES` | `512 * 1024` | `extract_signatures.py` | 超过 512KB 的源文件直接跳过 | 防止生成型大文件拖垮解析 |
| `DESC_TOP_N` | `100` | `generate_desc.py` | 词频取 Top N | 控制 desc 上下文规模 |
| `DESC_MAX_EXAMPLES` | `5` | `generate_desc.py` | 每词最多展示的典型符号示例数 | 同上 |
| `DESC_MIN_WORD_LEN` | `2` | `generate_desc.py` | 过滤单字母词 | 单字母无区分度 |
| `DIFF_SOURCE_EXTS` | 见 frontmatter | `diff_kb.py` | 纳入差异比对的源码扩展名集合 | 新增语言支持时必须扩表，否则该语言模块永远检测不到漂移 |
| `DIFF_SKIP_DIRS` | 见 frontmatter | `diff_kb.py` | 跳过目录（含 `build/`、`dist/`、`.venv`） | 避免把产物当源码比对 |
| `VALIDATE_OVERVIEW_REQUIRED` | `module_id, architectural_role` | `validate.py` | `_overview.md` **缺失即 error** | 与 SKILL.md 模板一体，改名需同步两处 |
| `VALIDATE_SUBMOD_RECOMMENDED` | `entity_names, retrieval_hints, architectural_role` | `validate.py` | 子文档推荐字段，缺失仅 warn | 影响召回而非正确性 |
| `VALIDATE_CODE_BLOCK_MAX_LINES` | `50` | `validate.py` | 代码块超 50 行判为"粘贴大段源码" | 知识库禁止复制原始代码 |
| `STUB_SCAN_EXIT_CODE` | `0` | `scan_repo.py` | 存根脚本恒定成功退出 | Codemap 预生成 workspace.json |
| `TREE_SITTER_PIN` | `tree-sitter~=0.21.0` | `requirements.txt` | 语法解析依赖版本；缺语言包时自动降级到通用正则 | 依赖不做隐式升级 |

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `check_sig_diff` / `check_new_symbols` / `check_bug_rules` / `check_arch_diff` | `diff_kb.py` | 四项差异检查各自独立可开；**不得**合并成单一"全量重写"，否则丢失信号粒度 |
| `BUG_RULE_RE` / `ANTI_PATTERN_RE` / `PROTOCOL_PREFIX_RE` / `STATE_CONST_RE` | `diff_kb.py` | 四类识别模式；协议前缀 `C_`/`S_`/`MSG_` 与状态常量 `STATE/STATUS/PHASE/STAGE` 用于同步命名规约检查 |
| `validate_conventions` | `validate.py` | 校验全局 `_conventions.md` 的 5 个必含节（数据持久化/协议/状态机/计数/模块间调用禁忌） |
| `probe_codemap` | `build_index.py` | 索引前确认 Codemap 可用，不可用则不得生成离线符号索引 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| `scan_repo.py` 的去留 | 保留为 exit(0) 存根 | 直接删除 | 旧调用点与文档引用仍指向它，删除会让历史命令报错；存根保证向前兼容 |
| 校验严格度分层 | 契约字段=error，召回质量字段=warn | 全部 error | 全 error 会让历史知识库无法通过 CI 式校验，团队倾向"结构错→拦、内容弱→提示" |
| `validate.py` 的协议入口判定 | 正则识别 `C_/S_`、`on_/handle_` 前缀推断是否需要「典型调用链」 | 要求显式 frontmatter 声明 | 无需作者额外声明，代价是纯文本里出现相似串会误判为需要该节 |
| 差异报告输出 | `--report` 写 markdown，同时 stdout | 只写文件 | Step 0b 要求把差异打印成「知识库差异扫描报告」供人审阅 |

## 跨模块依赖

> 外部依赖：

| 依赖 | 引用原因 | 关键符号 | confidence |
|------|---------|---------|------------|
| Codemap MCP | `build_index.py --workspace` / `probe_codemap` 需确认图索引可用 | `get_graph_stats` | extracted |
| 知识库产物目录 | 脚本的输入与输出都是 `.codemaker/codeindex/**` 的 markdown | `_overview.md` frontmatter | extracted |
| tree-sitter | 仅 `extract_signatures.py` 使用；失败时降级到通用正则 | `_extract_with_tree_sitter`, `_extract_generic` | extracted |

> 反向调用方：

| 调用方 | 调用场景 | 关键符号 |
|-------|---------|---------|
| `skills_kb_builder.md`（同一技能的 Step 流水线） | Step 0b 差异扫描、Step 6 索引、Step 7 校验 | `diff_kb.py --report`、`build_index.py`、`validate.py --coverage` |
| code-index-builder 之外无调用方 | — 这六个脚本不被 backend/frontend 引用 | — |

## 典型调用链

### 构建后校验（本仓库当前路径）
```
Step 7 → python3 scripts/validate.py .codemaker/codeindex
  → validate_module → validate_overview        ← 必填字段 / ## Files / ## 子文档速览
    → validate_submodule                       ← 跨模块依赖节、正文长度、代码块规模
      → validate --coverage                    ← 源文件覆盖率（每个源文件至少被一个子文档提及）
```

### 增量更新差异扫描
```
Step 0b → diff_kb.py <repo> --kb-dir <kb> --sig-diff     → [签名漂移]
        → diff_kb.py ... --new-syms                      → [新增符号]（含协议/状态常量规约）
        → diff_kb.py ... --bug-rules                     → [边界规则缺失]
        → diff_kb.py ... --arch-diff --depth <上次深度>  → [新增模块]/[已删除模块]/[架构膨胀]
        → diff_kb.py ... --report ./build/<repo>-diff-report.md
```

## 变更风险

- **改 `validate.py` 的必需章节名而不同步 SKILL.md 模板**：新生成的文档会集体报错或集体漏检——两处是同一契约的两个副本（`## Files`、`## 子文档速览`、`## 跨模块依赖` 在 SKILL.md 与 validate.py 中各写一次）。
- **扩 `DIFF_SOURCE_EXTS` 不加对应语言的 `STATE_CONST_RE` 适配**：新语言模块会被差异扫描完全忽略，导致知识库悄悄过期，直到某次需求命中错知识才暴露。
- **删掉 `scan_repo.py` 存根**：任何仍按旧文档调用它的流程会拿到非零退出码而非"无操作"，表现为构建中断（来源: `scan_repo.py` 头部注释）。
- **把 `_desc_context.md` 生成到知识库目录**：`generate_desc.py --prepare` 的产物必须落 `build/`；一旦混入 `.codemaker/codeindex/` 会被检索命中大量空行，污染 `search_knowledge` 结果（来源: SKILL.md「产物总览」警告）。

## 边界约束

- 允许：调整阈值、增加语言的扩展名、增加校验项（新校验项默认按 warn 引入，确认存量文档全通过后再升为 error）。禁止：在脚本里做语义判断（例如"自动总结模块业务意图"）——语义一律交 Agent（来源: SKILL.md 核心原则）。
- 允许：`--dry-run` 预览索引；禁止：让脚本直接读写 `.codemaker/codeindex/kb-config.json` 之外的注册表位置（`kb-config.json` 只能由 Step 9 写、且必须在知识库根一级）。

## 附：内置文档摘要

- `_overview.md` / 子文档的 frontmatter 解析由 `build_index.py:parse_frontmatter` 用**轻量正则**完成（支持标量、`- 列表`、两行以上缩进续行），不是完整 YAML。产物侧因此受约束：frontmatter 中**不要在双引号标量里再嵌套 ASCII 双引号**，否则该字段被解析成截断值——本知识库所有文档遵循"引号内改用「」**的写法。
- `validate.py` 的 `_conventions.md` 五节检查为**可选**（缺失仅 warn），与 SKILL.md「不生成全局 `_conventions.md`，跨模块禁忌写入各模块文档」的最新取向一致；即该校验器保留但对新产物不强制。

> 📄 本节内容来源于仓库内置文档：`.claude/skills/code-index-builder/scripts/{build_index,validate,diff_kb,extract_signatures,generate_desc,scan_repo}.py`、`.claude/skills/code-index-builder/requirements.txt`、`.claude/skills/code-index-builder/SKILL.md`（原文已提炼，非完整转录）
