---
type: "Fragment"
id: backend/src/data_store
title: "数据契约与 Parquet 存储层"
description: "K 线以什么列、什么时间级别、什么文件布局落盘，读取时如何裁剪与限量？"
parent: /backend/src/_overview.md
fragment: data_store
entity_names:
  constants:
    - name: OHLCV_COLUMNS
      value: "open_time, open, high, low, close, volume"
      source: backend/src/market_data/models.py
    - name: MARKET_CATEGORIES
      value: "SPOT, USDT-FUTURES"
      source: backend/src/market_data/models.py
    - name: SYMBOL_TYPES
      value: "crypto, metal, stock, commodity"
      source: backend/src/market_data/models.py
    - name: _TIMEFRAME_STEP_MS
      value: "1m..1mo 共 14 级（不含 1s）"
      source: backend/src/market_data/models.py
    - name: _REALTIME_ONLY_TIMEFRAMES
      value: "{'1s'}"
      source: backend/src/market_data/models.py
    - name: _TIMEFRAME_ALIASES
      value: "{'1M': '1mo', '1mo': '1mo', '1MO': '1mo'}"
      source: backend/src/market_data/models.py
    - name: MD_DATA_DIR
      value: "./data（Settings.data_dir 默认值）"
      source: backend/src/market_data/config.py
    - name: MD_SCHEDULE_INTERVAL_SECONDS
      value: "300（=0 时完全关闭后台调度）"
      source: backend/src/market_data/config.py
    - name: MD_CANDLE_PAGE_LIMIT
      value: "100（MCP 通道单页）"
      source: backend/src/market_data/config.py
    - name: MD_REST_CANDLE_PAGE_LIMIT
      value: "500（v2 REST 单页，上限 1000）"
      source: backend/src/market_data/config.py
    - name: MD_V3_CANDLE_PAGE_LIMIT
      value: "100（v3 history-candles 硬上限）"
      source: backend/src/market_data/config.py
    - name: DAY_FILE_FORMAT
      value: "<YYYY-MM-DD>.parquet（UTC 自然日）"
      source: backend/src/market_data/store.py
retrieval_hints:
  - "K 线保存在哪个目录、按什么粒度分文件？"
  - "新增一个时间级别（例如 8h）要改哪些地方才不会被判未支持？"
  - "为什么 `1M` 月线和 `1m` 分钟线不会被大小写归一化搞混？"
  - "为什么 1s 级别永远不落盘、不回灌、不进缺口检测？"
  - "读取宽区间历史时怎样才不随历史深度线性变慢？"
  - "⚠️ 如果你在找『实时 bar 的内存 buffer 与保序』，不在这里，在 `src_realtime.md`"
  - "⚠️ 如果你在找『回灌翻页与频控退避』，不在这里，在 `src_ingestion.md`"
  - "⚠️ 如果你在找缺口白名单（KNOWN_GAPS / STRUCTURAL_EXEMPTIONS），不在这里，在 `backend/tests` 模块"
  - "本模块也叫『行情库 / 本地列存 / parquet store』，对应需求中的『历史数据落地与读取』"
  - "架构归属：时间级别与品类的枚举真值只能加进 `models.py`，禁止在任何调用方内联字面量列表"
architectural_role: "后端最底层数据契约（配置 + 模型 + 列存），被行情/分析/量化/接口四条链路共用"
---

## 业务意图

本文件解决的业务问题是：**让整个系统对「一条 K 线长什么样、什么周期有效、存在哪里、怎么读」只有一个答案**。行情来自三条不同通道（MCP 工具、v2 REST、v3 REST）和一路 WebSocket，字段名与大小写都不一样；前端图表与 L1 数据门禁又都要求「严格升序、无重复 bar、相邻间隔等于周期步长」。若这些约定散落各处，任何一条链路改名或漏一列就会造成图表空窗、指标 NaN、门禁误报。因此本层把「列契约 + 级别全集 + 日分片落盘 + 裁剪读取」收敛为唯一真值源。

**本层文件范围**：`config.py`（`Settings` / `get_settings`，全部 `MD_*` 环境变量）、`models.py`（OHLCV 列契约、品类与级别全集、步长与粒度映射）、`store.py`（Parquet 日分片读写）、`__init__.py`（包门面：仅再导出 `Settings` 与 `get_settings`，故 `from market_data import get_settings` 是本包配置的唯一推荐读法；新增顶层导出即改变外部导入面，MUST 保持向后兼容）。

## 对外接口（内部契约，无网络协议）

| 接口 | 方向 | 关键字段/参数 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `Series(category, symbol, timeframe)` | 内部构造 | 构造期自动 `_normalize_timeframe` | 一条序列的身份，落盘目录名由 `relative_path()` 决定 | `models.py:Series` |
| `validate_timeframe` / `timeframe_step_ms` / `timeframe_to_granularity` | 内部查询 | 抛 `ValueError` 表示未支持 | 所有对外端点校验级别与换算步长的唯一入口 | `models.py` |
| `is_realtime_only_timeframe` | 内部查询 | 仅 `1s` | 「不落盘 / 不回灌 / 不检缺口」的总开关 | `models.py:is_realtime_only_timeframe` |
| `timeframe_to_spot_granularity` | 内部查询 | spot 长令牌 `1min/1day/1week/1M` | 现货 REST 与合约短令牌不兼容时用它换算 | `models.py` |
| `granularity_to_timeframe` | 内部解析 | 反向映射，撞键即 `RuntimeError` | 把 WS 频道名（如 `candle1M`）解析回内部 key | `models.py` |
| `ParquetStore.save(series, frame)` | 写盘 | 返回新增行数 | 按日分片 + `open_time` 去重合并（`keep="last"`），带 `OHLCV_COLUMNS` 缺失校验 | `store.py:ParquetStore.save` |
| `ParquetStore.read(series, start_ms, end_ms, limit)` | 读盘 | `limit` 反向累积 | 先裁日文件候选集，再从最新日反向累积到 `limit` 即停 | `store.py:ParquetStore.read` |
| `latest_open_time` / `earliest_open_time` | 读盘辅助 | 取首/尾日文件 | 增量拉取起点与回灌边界判定 | `store.py` |
| `get_settings()` / `Settings.parquet_dir` | 配置 | `MD_` 前缀，`.env` | 全进程唯一的配置读取口（`lru_cache` 单例） | `config.py` |

## 跨模块依赖

**外部依赖（本层引用谁）**

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| 第三方 `pandas` / `pyarrow` | Parquet 读写与列裁剪 | `pd.read_parquet`、`to_parquet` | extracted |
| 第三方 `pydantic-settings` | 环境变量与 `.env` 绑定、CSV 列表解析 | `BaseSettings`、`field_validator._split_csv` | extracted |
| 仓库根 `backend/.env.example` | 配置项清单必须与 `Settings` 字段同步（规格硬约束） | `Settings` | extracted |

**反向依赖（谁调用本层）**

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `src_ingestion.md`（`ingestion.py`/`scheduler.py`） | 拉取后落盘、增量起点查询 | `ParquetStore.save`、`latest_open_time` |
| `src_api_stores.md`（`webapi.py`） | `/candles`、`/analyze`、`/backtest` 读取与 422/400 校验 | `store.read`、`validate_timeframe` |
| `src_analysis.md` / `src_quant.md` | 计算输入（帧的列契约与升序前提是计算正确性的前提） | `OHLCV_COLUMNS` |
| `backend/scripts/backfill_micro_gaps.py` | 直接 `ParquetStore(Path("data/parquet"))` 复用写盘 | `ParquetStore.save` |
| `frontend/src` | 图表历史连续性与周期下拉全集（前端不定义有效级别，只消费） | `/api/candles`、`VALID_TIMEFRAMES` |
| `backend/tests/test_store.py`、`test_data_integrity.py` | 读取裁剪/缓存失效/缺口分类回归 | `test_read_trims_to_day_range` 等 |

## 典型调用链

### 一次 `/candles` 读取

```
frontend api-client → webapi.get_candles(category,symbol,timeframe,start,end,limit)   ← 接口层
  → ParquetStore.read(series, ... limit=500)          ← 本层
    → _day_key(start_ms)/裁剪候选日文件               ← 本层（避免全量 read）
    → _read_cached(<day>.parquet) 命中内存缓存         ← 本层
    → 反向累积到 limit 即停 → tail(limit) 升序返回     ← 本层
```

### 配置与存储路径的建立

```
process boot → pydantic BaseSettings(env_prefix="MD_", env_file=".env") → get_settings()
  → Settings.parquet_dir = data_dir/"parquet"
    → webapi.create_app: ParquetStore(settings.parquet_dir)
    → CLI 独立构造同一 store，二者路径语义必须一致
```

## 实现约束清单

> 实现涉及本层的需求时，必须逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `OHLCV_COLUMNS` | 6 列（`open_time` 为 UTC 毫秒 int64） | `models.py` | 所有帧的规范列，`store.save` 会拒绝缺列 | 规格要求「MUST 统一为 OHLCV」→ `openspec/changes/archive/2026-07-26-market-data-foundation/specs/kline-ingestion/spec.md` |
| `_TIMEFRAME_GRANULARITY` vs `_TIMEFRAME_GRANULARITY_SPOT` | 两套映射 | `models.py` | 合约用短令牌、现货用长令牌；混用会被上游拒答 | 现货长令牌与合约短令牌体系由 `models.py` 内两套映射与注释固定；前后端标识符往返一致见 `openspec/specs/timeframe-identifier-scheme/spec.md` |
| `MARKET_CATEGORIES` / `Settings.categories` | `["SPOT","USDT-FUTURES"]` | `models.py` / `config.py` | 镜像只维护这两类；其它产品线按规格禁止拉取 | 「系统 SHALL NOT 拉取 `MARGIN`/`USDC-FUTURES`/`COIN-FUTURES`」→ `openspec/specs/multi-market-hub/spec.md` |
| `_REALTIME_ONLY_TIMEFRAMES` | `{"1s"}` | `models.py` | 仅实时级别，排除在 `VALID_TIMEFRAMES` 之外，且无 step | 由 `is_realtime_only_timeframe` 的返回语义决定（不落盘/不回灌）；级别取值未集中文档化，`⚠️待定`（建议人工确认是否还有其它仅实时级别） |
| `candle_page_limit` / `rest_candle_page_limit` / `v3_candle_page_limit` | `100` / `500` / `100` | `config.py` | 三通道单页上限；v3 的 100 是交易所硬限，调大无效 | 交易所接口硬约束（各端点上限不同） |
| `backfill_page_delay` | `0.05` | `config.py` | 翻页节流下限，配合 `parallel` 一起限并发 | `→ openspec/specs/history-backfill/spec.md`【节流与频控保护】 |
| `agent_schedule_enabled` | `False`（默认） | `config.py` | 自动交易与自动重训的开闸位（仅保护性熔断不受控） | `→ openspec/specs/orchestration-jobs/spec.md` |
| `bb_api_key` | 空串、别名 `BB_API_KEY` | `config.py` | 仅服务端持有，前端只经 `/api/blockbeats/*` 代理 | `→ openspec/specs/blockbeats-data/spec.md` |

### 必须保持语义的函数（不可被常量内联替代）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_normalize_timeframe` | `models.py` | 必须**先查精确别名表**、再 lower；漏掉第一步就会把 `1M` 折成 `1m`；`Series.__post_init__` 依赖它做构造期归一 |
| `timeframe_step_ms` | `models.py` | 缺口检测与游标推进都用它；抛 `ValueError` 才算「未支持级别」，不可改成返回 0 |
| `granularity_to_timeframe` | `models.py` | 内置「重复 token 即 `RuntimeError`」自检，确保 `1M` 不坍缩到 `1m`；新增级别时若造成 token 冲突会启动即崩 |
| `ParquetStore.save` | `store.py` | **一切写入必须走它**；它负责 day 分片、按 `open_time` 去重、缓存失效，绕过它就破坏 `e2e-data-integrity` 契约 |
| `ParquetStore.read(limit=…)` | `store.py` | 反向限量 + 写后失效缓存的行为被测试锁定，不得改成正向截断 |

## 设计决策（存在多种可行方案时记录选型）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 月级如何与分钟级区分 | 内部 key 用 `1mo`，用精确别名字典表 `1M`→`1mo` | lower 后再判长度 | lower 后的 `1m` 与 `1M` 会碰撞；只有精确匹配 + 不透明 key 才彻底解耦 |
| 文件粒度 | 每 UTC 自然日一个 parquet | 单文件全量 | 日分片让按日期区间读取和缓存失效成为 O(days) 而非 O(rows)，避免全表重写 |
| 存储根目录 | 文件系统 Parquet 列存；JSON 仅用于配置/告警等轻量文档 | 全部用 JSON | 行情数据量大，规格明确拒绝「全 JSON 持久化」 |

### 边界（什么禁止做）

- ❌ 禁止在 `webapi.py`、`cli.py` 等处内联有效时间级别清单；禁止在分析层用 `len(candles)` 推断 step。
- ❌ 禁止让 `1s` 参与任何历史拉取、落盘、缺口检测与回灌；禁止为其补 step 映射「让它跑通」。
- ❌ 禁止绕过 `store.save` 直接 `to_parquet`；若写入路径不经它，则 `read` 缓存不会失效，前端会读到旧数据。
- ❌ 新增 `Settings` 字段时禁止不同步 `backend/.env.example`（含默认值），README 环境变量表需逐项一致。 （来源: `openspec/specs/repo-hygiene/spec.md`）
- ❌ 禁止修改 `.env.example` 的「只追加」惯例；删除既有变量会打断测试与部署。

## 变更风险

| 改动 | 破坏什么 | 后果 | 约束由来 |
|---|---|---|---|
| 动到 `_TIMEFRAME_GRANULARITY` / `_TIMEFRAME_GRANULARITY_SPOT` / `_TIMEFRAME_ALIASES` | 月/分消歧与现货长令牌体系（`1M` 在两个体系中的不同含义；spot 与 mix 使用不同 granularity） | 图表读到错误周期或空数据 | （来源: 代码内映射与 `validate_timeframe` 语义） |
| 动到 `_TIMEFRAME_STEP_MS`；新增级别时若造成 token 冲突 | WS 频道名 → 内部 series 的反向解析（`granularity_to_timeframe` 内置了「重复 token 即 `RuntimeError`」自检，新增级别时若造成 token 冲突会启动即崩） | 启动期崩溃或路由到错误周期 | — |
| 改 store 写盘去重逻辑（`drop_duplicates` 前移、改分区规则、改成「直接覆盖」） | ① `e2e-data-integrity` 的「严格升序且无重复 bar」硬断言；② `ingestion` 与 `backend/scripts` 回填脚本依赖 `save` 返回值来报告「新增 bar 数」；③ 前端历史与实时 bar 拼接出现重复/错序 | 门禁失败（`test_data_integrity.py`）并连带污染所有下游分析结果 | （来源: `openspec/specs/e2e-data-integrity/spec.md`「无重复/升序」；`ParquetStore.save` 调用方分析） |
| 改 `read` 的 limit/裁剪语义（改成先全读再切片） | 「读取不随历史深度线性变慢」性能约束与前端历史预加载体验 | 随数据增长而线性变慢（数据量变大后明显劣化） | （来源: `openspec/specs/market-data-read-speed/spec.md`「按需裁剪与限量」） |
| 在 CLI/脚本里用 `MD_DATA_DIR` 却不通过 `get_settings` 读取 | 读写路径分叉，回填脚本写进「另一个库」 | L1 门禁与图表仍显示缺失 | （来源: 代码级观察 `cli.py` / `backend/scripts/backfill_micro_gaps.py`） |

**数据分级**：本层不落任何凭据；`bb_api_key`、`BITGET_API_KEY/SECRET_KEY/PASSPHRASE` 仅从环境变量/`backend/.env` 读取，MUST NOT 下发前端或写入 Parquet/JSON 文档。 （来源: `openspec/specs/system-architecture/spec.md`「凭据仅从环境变量读取」、`openspec/specs/blockbeats-data/spec.md`「key 同样取自 `backend/.env` 的 `BB_API_KEY`，仅后端持有」）

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **落盘布局本身是契约**：K 线 MUST 以 Parquet 落地，按 `category/symbol/timeframe` 分区并**按 UTC 自然日每日一个文件**（`<YYYY-MM-DD>.parquet`）；写入 MUST 以 `open_time` 去重合并，保证同一 bar 不重复；按区间读取 MUST 返回升序序列。（来源: `openspec/specs/market-data-store/spec.md`）
- **Excel 导出沿用同一按日分文件口径**：`<YYYY-MM-DD>.xlsx`，支持「按查询一次性导出」与「拉取过程实时追加」两种模式；实时写 MUST 批量/节流以避免高频阻塞——即导出不得拖慢入库主路径。（来源: `openspec/specs/excel-export/spec.md`）
- **时间级别全集**：标识符 MUST 覆盖 Bitget 原生全集，且 MUST NOT 定义任何非交易所原生的合成级别（如 15 秒、6 月、1 年）；非原生级别 MUST 被明确拒绝并给出未支持提示，MUST NOT 静默降级为相近级别。（来源: `openspec/specs/timeframe-identifier-scheme/spec.md`、`openspec/specs/market-endpoints/spec.md`）
- ⚠️ **规格文本自相矛盾（以代码为准）**：`timeframe-identifier-scheme` 将原生全集逐项列为秒级 1 + 分钟 5 + 小时 5 + 天 2 + 周 1 + 月 1（枚举合计 15 项），却写成「共 13 项」；`models.py` 实为 **14 个可回灌级别**（`_TIMEFRAME_STEP_MS`），另有 `1s` 仅实时级别，粒度 token 表 `_TIMEFRAME_GRANULARITY` 共 15 项。新增级别时 MUST 同步 `_TIMEFRAME_STEP_MS` / `_TIMEFRAME_GRANULARITY` / 步长解析三处，勿按规格文本推断数量，也 MUST NOT 以硬编码 13/15 做数量断言。（来源: `openspec/specs/timeframe-identifier-scheme/spec.md`、`backend/src/market_data/models.py`）
- **月/分消歧是硬约束**：归一化处理 MUST NOT 使月级与分钟级在大小写无关比较下收敛为同一标识符；两者的存储路径与交易所粒度 token MUST 不同——代码以 `1mo` 键 + `_TIMEFRAME_ALIASES` 实现这一保证。（来源: `openspec/specs/timeframe-identifier-scheme/spec.md`）
- **仅实时级别（`1s`）三条禁令 + 三条义务**：MUST NOT 向历史接口发请求、MUST NOT 落盘、MUST NOT 进定时抓取与缺口/回灌；其历史请求 MUST 返回空结果（不得出现失败请求噪音）；实时推送 MUST NOT 泄漏给其他级别订阅方。（来源: `openspec/specs/realtime-only-timeframe/spec.md`、`openspec/specs/kline-ingestion/spec.md`）
- **品类范围限定**：行情镜像 SHALL 只覆盖 `SPOT` 与 `USDT-FUTURES`，SHALL NOT 拉取 `MARGIN` / `USDC-FUTURES` / `COIN-FUTURES`；instrument 元数据经 v3 全品类拉取并归一为统一字段（含 `symbolType` crypto/metal/stock/commodity、`isRwa`、`isReality`、价格与数量精度）。（来源: `openspec/specs/multi-market-hub/spec.md`、`openspec/specs/exchange-data-hub/spec.md`）
- **改动本层即改动 L1 门禁断言**：`open_time` 严格递增无重复；`high >= max(open,close)`、`low <= min(open,close)`、`volume >= 0` 且全部为有限值；相邻 bar 间隔 MUST 等于该 timeframe 的 step（首尾窗口截断豁免）；缺口三分类——A 结构性（≥5 步，登记 `STRUCTURAL_EXEMPTIONS` 后豁免）、B 微缺口（1~2 步，登记 `KNOWN_GAPS` 且为硬断言）、C 停滞（最新 bar 早于 `now - 2*step`，仅在线子集）。新增时间级别或新缺口若未同步注册表会直接打红 hard gate（注册表本体在 `backend/tests` 模块）。（来源: `openspec/specs/e2e-data-integrity/spec.md`）
