---
type: "Fragment"
id: backend/scripts/micro_gap_backfill
title: "行情缺口回填脚本 / 逐缺口回填执行链"
description: "如何把一个已登记的类型 B 微缺口真正补进 Parquet store？跑哪个脚本、要什么前置条件、失败会怎样？"
parent: /backend/scripts/_overview.md
fragment: micro_gap_backfill
architectural_role: "数据修复工具层 · 手工触发的一次性批处理，禁止被后端运行时 import"
entity_names:
  constants:
    - name: TYPE_A_MIN_STEPS
      source: backend/scripts/backfill_micro_gaps.py
      value: "5（缺失步数 ≥5 判为类型 A（豁免，本脚本不处理）；<5 才是本脚本要回填的类型 B）"
    - name: STORE（脚本写库根路径）
      source: backend/scripts/backfill_micro_gaps.py
      value: 'ParquetStore(Path("data/parquet")) — 相对 CWD，必须在 backend/ 下执行'
    - name: v3 单页 limit（脚本硬编码）
      source: backend/scripts/backfill_micro_gaps.py
      value: "100（1~2 根缺口的窗口远小于 100 行；同时受 v3 端点单次 ≤100 行上限约束）"
    - name: 拉取窗口右端 end_ms
      source: backend/scripts/backfill_micro_gaps.py
      value: "hi_ms + step（缺口上界再往后 1 个步长，保证把缺失 bar 包进返回页）"
    - name: margin（落库前裁剪余量）
      source: backend/scripts/backfill_micro_gaps.py
      value: "3 * step（只保留 [lo_ms-3*step, hi_ms+3*step] 内的行，避免整页 100 行全量入库）"
    - name: V3_HISTORY_CANDLES_URL（实际外部依赖端点）
      source: backend/src/market_data/ingestion.py
      value: "https://api.bitget.com/api/v3/market/history-candles（公共无鉴权；单次 ≤100 行、跨度 ≤90 天、频控 20 req/s）"
    - name: 输出时间格式 ms_dt
      source: backend/scripts/backfill_micro_gaps.py
      value: '%Y-%m-%d %H:%M（UTC）— 与 data_registry.py 中白名单注释的时间写法同源，便于比对'
    - name: sys.path 注入项
      source: backend/scripts/backfill_micro_gaps.py
      value: "<backend>/src 与 <backend>/tests（脚本非包内模块，靠路径注入才能同时 import 生产代码与测试注册表）"
retrieval_hints:
  - "L1 数据门禁报了 unknown micro-gaps，我该怎么把缺的那两根 bar 补回去？"
  - "为什么跑完回填脚本，pytest -m integrity 还是红的？"
  - "回填时会往 Parquet store 写进缺口以外的数据吗，会不会重复？"
  - "⚠️ 如果你找的是『图表向左翻页时按需拉更早历史』或『90 天窗口之外的深度回灌』，不在这里——那在生产链路 `backend/src/market_data/ingestion.py`（`backfill_before` / `backfill_before_rest` / `_backfill_before_rest_parallel`）与 webapi 的按需回灌接口，本脚本只处理白名单里 1~2 步的微缺口。"
  - "⚠️ 如果你找的是『实时数据周期性落盘（增量持久化）』，不在这里——那是 webapi lifespan 里的 scheduler（受 `MD_SCHEDULE_INTERVAL_SECONDS` 控制，测试环境置 0 关闭），本脚本一次性手工执行，不参与任何调度。"
  - "⚠️ 如果你要找的是缺口『白名单/豁免规则』本身（`KNOWN_GAPS` / `STRUCTURAL_EXEMPTIONS` 的定义与断言语义），登记与门禁侧规则见同目录 `scripts_gap_contract.md`。"
  - "缺口回填 / 微缺口 / micro-gap / 补根 / 修数据 / 数据修复，指的都是本脚本 `backend/scripts/backfill_micro_gaps.py`"
  - "新增任何数据修复动作，必须扩写 `backfill_micro_gaps.py`（或复用 `backend/src/market_data` 既有通道），禁止在 `backend/scripts` 下新建被生产代码 import 的模块，也禁止另建第二个回填脚本。"
---

## 业务意图（解决什么问题）

Parquet store 里出现的 1~2 步缺根（micro-gap）既不能长期豁免，也不值得为它开一条生产级回灌通道：它是**一次性的数据卫生问题**，修复动作只需「按登记的缺口区间向交易所要一小段窗口、去重合并进库、确认缺口消失」。本脚本把这一步固化成可重复执行、可自我验证（同一份分类逻辑既用于找缺口，也用于复核补没补上）的离线工具，从而让 L1 门禁可以坚持「白名单之外的类型 B 间隙一律失败」这条硬规则，而不必为了少数几处缺根放宽断言。
（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4 与风险表「全量数据断言误报（历史残留缺根）→ KNOWN_GAPS 白名单机制」）

## 对外接口

本子模块无 HTTP/WS 协议，唯一「契约面」是命令行入口与它的输出：

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `scripts/backfill_micro_gaps.py`（在 `backend/` 下执行） | 开发者 → 数据层 | 无参数；任务清单固定取 `KNOWN_GAPS` 的全部 key 与区间 | 逐 series 打印 `before: N micro-gaps` → 每缺口一行结果 → `after: M micro-gaps` → `TOTAL added rows: K` | `backend/scripts/backfill_micro_gaps.py:main` |
| `pytest -m integrity` 的缺口断言 | 数据层 → 门禁 | `unknown micro-gaps: [(lo, hi, steps)]` | 门禁输出即本脚本的输入来源：把该三元组的前两项登记为 `KNOWN_GAPS[series]` 的 `(lo_ms, hi_ms)` | `backend/tests/test_data_integrity.py:test_adjacent_spacing_equals_step` |

## 执行链（每条都是函数名级，标注跨模块边界）

### 回填一个已登记的微缺口

```
data_registry.KNOWN_GAPS["USDT-FUTURES/BTCUSDT/1m"] = [(lo_ms, hi_ms), ...]   ← 跨模块：backend/tests
  → backfill_micro_gaps.py:main                       ← 本模块入口
    → Series(cat, sym, tf) + timeframe_step_ms(tf) + timeframe_to_granularity(tf)   ← 跨模块：backend/src/market_data/models
    → remaining_b_gaps(series) → classify_gaps(series) → ParquetStore.read(series)   ← 跨模块：backend/src/market_data/store
    → KlineIngestor._fetch_v3_history_page(cat, sym, granularity, hi_ms + step, 100) ← 跨模块：backend/src/market_data/ingestion（Bitget v3 REST）
    → KlineIngestor._normalize_payload(rows) → 按 [lo_ms-3*step, hi_ms+3*step] 裁剪
    → ParquetStore.save(series, frame)  → 按 UTC 日历日分区、drop_duplicates(subset="open_time", keep="last")  ← 跨模块：store
    → remaining_b_gaps(series) 再算一次 → 打印 after，作为本次修复的唯一验收信号
```

### 侦察某 series 的真实缺口（不写库）

```
backfill_micro_gaps.py:classify_gaps(series)
  → ParquetStore.read(series) → open_time(int64 ms) → diff()/step 四舍五入为「间隔倍数 mult」
    → mult != 1 的位置即缺口，产出 (t[i], t[i+1], mult)：起止为**存活的相邻两根 bar**，不是缺失 bar 本身
```

## 典型场景与判读

- `+N rows`：该缺口新增 N 根 bar；`N` 应≈缺失步数（1 或 2）。
- `no new rows (gap still open)`：拉取成功但没有任何新行——通常意味着交易所该窗口本就无数据，或落库后全被去重吃掉；此时缺口仍在，不得清空白名单条目。
- `EMPTY fetch`：v3 返回空页。按 `v3-history-channel` 规格，空页只来自无鉴权公共端点的真实边界或抖动，**不等于数据一定补不齐**，需人工复核后再决定是转类型 A 豁免还是换通道。
- `ERROR <类型>: <消息>`：单个缺口失败**不会中断整轮**（`except Exception` 兜底后继续下一个缺口/下一个 series）。这是刻意的容错设计，与规格「单目标失败仅记录日志、不中断后续调度」同风格，但代价是：脚本退出码始终为 0，**不能以「跑完没报错」作为修复成功的判据**，必须看 `after` 行。
（来源: `openspec/specs/kline-history-gap-fill/spec.md`「webapi 常驻增量落盘」Scenario「单个目标失败不中断调度」）

## 实现约束清单

> 改动或复用本脚本前逐条核对。

### 必须遵守的运行/写入常量

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `TYPE_A_MIN_STEPS` | `5` | `backend/scripts/backfill_micro_gaps.py` | A/B 分界：≥5 步只统计不回填，<5 步才回填 | **必须与 `backend/tests/test_data_integrity.py` 的 `TYPE_A_MIN_STEPS = 5` 以及 `data_registry.is_exempt(min_steps=5)` 三处保持同一数值**，否则「脚本认为无需处理」与「门禁要求登记」互相错位 |
| `STORE` 根 | `Path("data/parquet")` | 同上 | 相对路径，等价于 `Settings.parquet_dir` 的**默认值** | 脚本不读 `MD_DATA_DIR`；在自定义数据目录的环境执行只会写错地方（—） |
| v3 单页 `limit` | `100` | 同上（并被 `_fetch_v3_history_page` 再次 `min(limit, 100)` 夹紧） | 1~2 根缺口一页足够 | `v3-history-channel` 规格：「单次请求 limit SHALL 不超过 100 根，单次 startTime/endTime 区间 SHALL 不超过 90 天」 |
| 窗口裁剪 `margin` | `3 * step` | 同上 | 只落缺口附近数据，避免整页 100 行进库 | 防止「一次修复顺带把别时段的历史写进 store」，使缺口侦察基线漂移（—） |
| 游标 `end_ms` | `hi_ms + step` | 同上 | 以 `endTime` 向前取页 | v3 以 `endTime` 为游标返回**截至**该时刻的页，不外加 1 步会正好把缺失 bar 留在窗口外 |

### 必须实现的函数（语义不可并省）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `classify_gaps` | `backfill_micro_gaps.py` | 从**已存数据**重算缺口，返回 `(t[i], t[i+1], mult)`；键点是使用「存活 bar 对」作为区间标识，与 `KNOWN_GAPS` 的元组格式严格同构 |
| `remaining_b_gaps` | `backfill_micro_gaps.py` | 在 `classify_gaps` 结果上过滤 `mult < TYPE_A_MIN_STEPS`，作为修复前/修复后的唯一验收口径，**不得用「白名单还剩几条」代替实测** |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 缺口怎么找 | 现场读 Parquet 重算（`classify_gaps`） | 直接信 `KNOWN_GAPS` 登记的元组 | 白名单可能因数据补齐而过期；用同一份口径做 before/after 才能证明「真的补上了」，并顺带暴露过期登记 |
| 拉哪个通道 | 复用生产 `_fetch_v3_history_page`（REST 主通道） | 走 MCP `history-candles` / v2 REST | 规格把 v3 定为深度回灌的**主通道**（可回溯交易所真实最早历史、无近端窗口深度限制）；回填脚本不该引入第二份 HTTP/归一化实现 |
| 写库方式 | 复用 `ParquetStore.save`（按日分区 + `open_time` 去重 + 排序） | 脚本自行 `to_parquet` 追加 | `save` 的去重/排序是「store 与 buffer 合并结果 SHALL 严格升序且无重复 bar」这条契约的唯一守护者；自写落盘会绕过它 |
| 失败处理 | 逐缺口 try/except，仅打印 | 抛出中断整轮 | 一次运行要扫多个 series；单个缺口的网络抖动不该毁掉其余修复。代价见「典型场景与判读」——退出码不可信 |

## 跨模块依赖

> 实现本子文档功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src` | 拉取与落盘全部复用生产实现，脚本本身不写 HTTP/不写 parquet | `KlineIngestor._fetch_v3_history_page`、`_normalize_payload`、`ParquetStore.save`、`V3_HISTORY_CANDLES_URL` | extracted |
| `backend/src` | 时间级别 ↔ granularity 的换算唯一真源 | `timeframe_to_granularity`（`models.py`；SPOT 长名版本 `timeframe_to_spot_granularity` 尚未覆盖） | extracted |
| `backend/tests` | 缺口白名单是脚本唯一的任务清单来源，且分类口径必须与门禁同构 | `KNOWN_GAPS`、`classify_gaps` 元组语义（`data_registry.py`） | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 无（仅开发者在 `backend/` 下手工执行；`backend/tests` 的 L1 门禁给出「哪些缺口待修」的结论，但不 import 本脚本） | L1 `pytest -m integrity` 报 unknown micro-gaps 后的人工修复 | — |

## 变更风险

- **私有方法耦合**：脚本直接调 `KlineIngestor._fetch_v3_history_page` / `_normalize_payload`（前导下划线 = 生产代码的内部实现）。一旦它们被改名、改成实例方法（需要 `self`/客户端句柄）或换端点，本脚本会以 `TypeError`/`AttributeError` 形式**被 except 吞成一行 ERROR**。修改这两个方法时必须同步检查本脚本；若要长期依赖，应在 `KlineIngestor` 上提升到公开 API 再调用。
- **归一化口径依赖**：`save` 按 `_day_key(open_time)`（UTC 日历日）分文件并 `astype("int64")`；若 `_normalize_payload` 输出的 `open_time` 单位/ dtype 变化（如变成秒或字符串），脚本会写出错误分区的文件，直接破坏 L1 的「严格递增 + 无重复」断言。
- **SPOT 通道的粒度 token 错配**：脚本对所有 category 一视同仁地用 `timeframe_to_granularity`（合约短名 `1m/1D/1W`）。若将来 `KNOWN_GAPS` 出现 `SPOT/*` 序列，v3 请求可能需要 `timeframe_to_spot_granularity` 的长名（`1min/1day/1week`），否则会得到空页并被误读为「无数据」。当前白名单只有 `USDT-FUTURES/*`，此路径**尚未经实测验证**。
- **频控与退避缺失**：脚本不节流、不重试（生产侧 `_call_v2_with_backoff`/`_backfill_before_rest_parallel` 才有退避与并发窗口切分）。缺口很多时连续请求可能撞上 `20 req/s` 频控，表现为成批 `ERROR rate limit: HTTP 429`——此时应分批重跑，不要为了「跑通」去改成一次拉更大窗口。
- **禁止**把本脚本接进 webapi / APScheduler / 测试夹具：它的语义是「人工确认后的定点修复」，一旦常驻就与「增量落盘 scheduler」争抢同一份 store，且 `sys.path` 注入方式在包内导入下会产生重复模块实例。
