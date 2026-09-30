---
type: "Module"
id: backend/scripts
title: "行情缺口回填脚本"
description: "以一次性离线脚本方式，把 L1 数据门禁登记的类型 B 微缺口逐窗口回填进 Parquet store，让行情时间序列重新满足硬门禁。"
module_id: backend/scripts
architectural_role: "运维/数据修复工具层（一次性 CLI 脚本），不参与后端运行时，不被任何服务进程 import"
world_model_hints:
  - "属于仓库最外层的『手工数据工程』层：由开发者在 `backend/` 目录下手工执行，无常驻进程、无调度、无 API"
  - "上游是测试侧的缺口白名单（`backend/tests/data_registry.py:KNOWN_GAPS`）与 L1 数据完整性门禁的失败结论"
  - "下游是 `backend/src/market_data` 的 Parquet store 与实时/历史读取链路（`/candles`、WS 推送、量化回测）"
  - "它复用生产代码（`KlineIngestor` v3 拉取 + `ParquetStore.save`），但只以脚本身份调用，禁止被生产代码反向 import"
upstream_modules:
  - module: backend/tests（缺口注册表 KNOWN_GAPS 是本脚本唯一的任务清单来源）
    confidence: extracted
  - module: repo-root（AGENTS.md「Test Suite」层说明 + 开发者手工执行）
    confidence: extracted
downstream_modules:
  - module: backend/src（market_data.store.ParquetStore 落盘 / market_data.ingestion v3 REST 拉取）
    confidence: extracted
  - module: backend/tests（L1 门禁 pytest -m integrity 的通过/失败结论）
    confidence: extracted
  - module: frontend/src（图表与历史数据消费端，store 补齐后才连续）
    confidence: inferred
---

## Files

### 源代码路径

- `backend/scripts/`
- 同级散落代码文件（本模块唯一实体）：`backend/scripts/backfill_micro_gaps.py`（约 100 行，`main` / `classify_gaps` / `remaining_b_gaps` / `ms_dt` 四个函数）

### 关联数据/契约文件（脚本运行依赖，改动需联动）

- `backend/tests/data_registry.py` — `KNOWN_GAPS`（类型 B 微缺口清单，脚本的输入）与 `STRUCTURAL_EXEMPTIONS`（类型 A 豁免，脚本**不处理**）
- `backend/tests/test_data_integrity.py` — L1 门禁；其 `TYPE_A_MIN_STEPS=5` / `_classify_gaps` 与脚本的分类逻辑必须同语义
- `backend/src/market_data/store.py` — `ParquetStore.save`（按 UTC 日历日分区、`open_time` 去重合并，返回新增行数）
- `backend/src/market_data/ingestion.py` — `KlineIngestor._fetch_v3_history_page` / `_normalize_payload`（脚本以私有静态方法方式直接调用）
- `backend/src/market_data/models.py` — `Series` / `timeframe_step_ms` / `timeframe_to_granularity`
- `backend/src/market_data/config.py` — `Settings.parquet_dir`（默认 `./data/parquet`，可由 `MD_DATA_DIR` 改写；脚本**未读取该配置**）

### 知识库文档

- `.codemaker/codeindex/backend/scripts/_overview.md`（本文件）
- `.codemaker/codeindex/backend/scripts/scripts_micro_gap_backfill.md`
- `.codemaker/codeindex/backend/scripts/scripts_gap_contract.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）；入口符号 `backend.scripts.backfill_micro_gaps.main`

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `scripts_micro_gap_backfill.md` | 逐缺口回填执行链：读白名单 → v3 单页拉取 → 窗口裁剪 → store 去重合并 → before/after 报告；路径与 CWD 前置条件 | `main`、`classify_gaps`、`remaining_b_gaps`、`TYPE_A_MIN_STEPS=5`、`limit=100`、`margin=3*step`、`STORE=Path("data/parquet")` |
| `scripts_gap_contract.md` | 缺口三层分类（A/B/C）契约、回填后白名单必须手工清空的规则、与 L1 门禁/生产回灌通道的职责边界、私有方法耦合风险 | `KNOWN_GAPS`（当前 `{}`）、`STRUCTURAL_EXEMPTIONS`、`test_gap_classification_consistent`、`is_exempt(min_steps=5)`、`V3_HISTORY_CANDLES_URL` |

## 模块概述

**业务定位**：本模块解决的是「行情库里的历史数据已经出现缺根，而门禁不会因为『暂时缺两根』而放宽」这一业务问题。L1 数据完整性门禁把相邻 bar 间隔不等于 timeframe step 的间隙分为三类：类型 A（结构性缺失，≥5 步，登记豁免，属数据工程范围）、类型 B（1~2 步微缺口，硬门禁）、类型 C（数据停滞，在线子集）。类型 B 是唯一「必须真正修好、不能长期豁免」的一类——本模块就是它的修复工具：读白名单 → 逐缺口向交易所拉一小段窗口 → 去重合并进 Parquet store → 打印修复前后状态，使 `KNOWN_GAPS` 能够被逐条清空，而不是让白名单无限膨胀。它同时承担「缺口侦察」作用：即便不写入，`classify_gaps` 也能给出某 series 实际的缺口区间（起止时间 + 步数）。
（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4「缺口三层分类」、`AGENTS.md`「Test Suite」Notes）

**业务上游**：没有代码调用方，触发者是开发者本人——在 `backend/` 目录下手工执行 `.venv/Scripts/python.exe scripts/backfill_micro_gaps.py`。触发时机由 L1 门禁的失败输出决定：`pytest -m integrity` 报 `unknown micro-gaps` 时，先在 `data_registry.py:KNOWN_GAPS` 登记该区间的 `(lo_ms, hi_ms)`，再跑本脚本回填（脚本只遍历 `KNOWN_GAPS` 的 key，白名单为空时是彻底的 no-op）。
（来源: `backend/tests/data_registry.py` 模块 docstring、`backend/scripts/backfill_micro_gaps.py` 文件头说明）

**业务下游影响**：写入的是生产读取链路共用的同一份 Parquet store，因此一次执行会同时改变 ①L1 门禁结论（缺口消失 / 白名单过期）②`/candles` 与历史预加载返回的连续性 ③前端 K 线是否出现空洞 ④量化回测/因子计算取到的样本集合。规格对该连续性有硬要求：图表历史 SHALL 严格升序且无重复 bar，因此本脚本必须复用带 `open_time` 去重的 `ParquetStore.save`，不得自行追加写。
（来源: `openspec/specs/kline-history-gap-fill/spec.md`「历史数据 gap 补齐」、`openspec/specs/e2e-data-integrity/spec.md`）

## 架构简析

模块采用「注册表读取 → 缺口分类 → 单页外部拉取 → 落盘合并 → 状态报告」的一次性批处理结构，只有一条脚本，没有分层：

`data_registry.KNOWN_GAPS` → `backfill_micro_gaps.py:main` → `remaining_b_gaps/classify_gaps`（复用 `ParquetStore.read` + `timeframe_step_ms`）→ `KlineIngestor._fetch_v3_history_page` → `_normalize_payload` → 窗口裁剪 → `ParquetStore.save` → 打印 before/after

- **核心文件**：`backfill_micro_gaps.py`（模块唯一文件，四个函数：`main` 驱动循环、`classify_gaps` 从已存数据重算缺口、`remaining_b_gaps` 过滤出仍属类型 B 的缺口、`ms_dt` 把毫秒转成可读 UTC 时间）。
- **关键数据流**：`KNOWN_GAPS[key]` 的每个 `(lo_ms, hi_ms)` → 以缺口上界 + 1 step 作为 `endTime` 游标、`limit=100` 拉一页 v3 history-candles → 用 `margin=3*step` 把窗口裁回缺口附近 → `save` 返回新增行数即为该缺口的修复量。
- **路径/环境前置**：脚本头部用 `sys.path.insert` 手工注入 `../src` 与 `../tests`，并以**相对路径** `Path("data/parquet")` 构造 store，因此「必须在 `backend/` 目录下执行」是运行契约的一部分，而不是使用建议。
- **扩展点**：本模块无插件机制。新增数据修复逻辑的规范做法是给既有脚本加子命令/参数，或在 `backend/src/market_data` 侧补生产级通道——不要在 `backend/scripts` 下新建被生产代码 import 的模块。

## 上下游关系

> `extracted` = 静态分析/import 关系可验证；`inferred` = Agent 推断待复核

**上游（谁触发/驱动本模块）**

| 上游 | 方式 | 依据 | confidence |
|------|------|------|------------|
| 开发者手工执行 | `cd backend && .venv/Scripts/python.exe scripts/backfill_micro_gaps.py` | 脚本 docstring 明示运行位置 | extracted |
| `backend/tests/data_registry.py` | `from data_registry import KNOWN_GAPS`（经 `sys.path` 注入 `backend/tests`） | 脚本 import 语句 | extracted |
| L1 门禁失败输出 | `test_adjacent_spacing_equals_step` 打印未登记 micro-gap → 人工登记 → 运行脚本 | `backend/tests/test_data_integrity.py` | inferred |

**下游（本模块影响谁）**

| 下游 | 影响 | confidence |
|------|------|------------|
| `backend/src/market_data/store.py` 的数据本体 | 向 `data/parquet/<category>/<symbol>/<timeframe>/<YYYY-MM-DD>.parquet` 追加/合并 bar | extracted |
| `backend/tests/test_data_integrity.py` | 缺口消失后，未清空的 `KNOWN_GAPS` 条目会被 `test_gap_classification_consistent` 判为 stale 而失败 | extracted |
| `backend/src` 的 `/candles`、实时 buffer 合并、`market-data-read-speed` 读取路径 | store 变长，历史连续性与首尾窗口截断判定随之变化 | inferred |
| `frontend/src` K 线终端 | 历史空洞消失（反之，脚本 ERROR 被吞时用户仍会看到跳空） | inferred |

## 变更风险速览（详见子文档）

- 改了脚本的缺口分类（`mult != 1` / `< TYPE_A_MIN_STEPS`）但没同步 `test_data_integrity.py` → 脚本判「已修好」而门禁判「仍未登记」，或反之，出现「跑完脚本门禁依然红」的假修复。
- 把白名单条目当作「已登记即已修复」 → 规格要求白名单随数据修复**逐条清空**；残留条目会触发 stale 断言失败，同时掩盖将来同区间的新缺根。
- 用 `MD_DATA_DIR` 改写过数据目录的环境里执行脚本 → 写进了默认 `data/parquet`，真实 store 未变，L1 与前端仍缺数据。
- 把 `KlineIngestor` 的 v3/normalize 私有方法改名、改成实例方法或换成 MCP 通道 → 本脚本静默失效（`except Exception` 会把它变成一行 ERROR 日志而不是报错退出）。
