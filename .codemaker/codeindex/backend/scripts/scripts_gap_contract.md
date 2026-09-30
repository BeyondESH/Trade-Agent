---
type: "Fragment"
id: backend/scripts/gap_contract
title: "行情缺口回填脚本 / 缺口分类与白名单维护契约"
description: "类型 A/B/C 缺口分别由谁负责？回填完成后白名单要怎么收尾？哪些缺口禁止用脚本处理？"
parent: /backend/scripts/_overview.md
fragment: gap_contract
architectural_role: "数据质量契约层 · 脚本与 L1 门禁共享的分类口径，禁止两侧语义分叉"
entity_names:
  constants:
    - name: KNOWN_GAPS
      source: backend/tests/data_registry.py（被本脚本 import 为任务清单）
      value: "{} （类型 B 微缺口硬门禁白名单；19 处已于 2026-08-20 由本脚本全部回填并清空）"
    - name: STRUCTURAL_EXEMPTIONS
      source: backend/tests/data_registry.py
      value: "10 个 series / 14 段区间（类型 A 结构性缺失豁免表，key 形如 \"USDT-FUTURES/BTCUSDT/1m\"，值为 (lo_ms, hi_ms) 列表）"
    - name: 缺口区间元组语义 (lo_ms, hi_ms)
      source: backend/tests/data_registry.py + backend/scripts/backfill_micro_gaps.py
      value: "**存活的相邻两根 bar 的 open_time（缺失 bar 本身不在其中）**；两端必须与 classify_gaps 输出逐字节相等才算同一条记录"
    - name: is_exempt(series, lo_ms, hi_ms, min_steps=5)
      source: backend/tests/data_registry.py
      value: "min_steps >= 5 且 (lo,hi) 命中 STRUCTURAL_EXEMPTIONS[series] 才返回 True；不认 KNOWN_GAPS（B 类由 hard gate 断言处理）"
    - name: test_gap_classification_consistent（回填收尾判定）
      source: backend/tests/test_data_integrity.py
      value: "把白名单减去实测缺口集合：非空即 fail，报 \"stale KNOWN_GAPS entries (no longer present)\""
retrieval_hints:
  - "什么算 micro-gap（类型 B），什么算结构性缺失（类型 A），谁负责修？"
  - "回填完成后 KNOWN_GAPS 里的条目还留着会怎样？"
  - "为什么 1m 序列上那几个整月空白不让这个脚本补？"
  - "本模块和 L1 数据完整性门禁之间的口径是怎么对齐的？"
  - "⚠️ 如果你要找的是缺口断言的完整实现（OHLC 合法性、严格递增、新鲜度 type C），不在这里，在 `backend/tests`（`test_data_integrity.py` + `data_registry.py`）；本模块只沉淀『脚本侧的契约与职责边界』。"
  - "⚠️ 如果你要找的是 store 的分区/去重落盘规则（按 UTC 日历日一文件），不在这里，在 `backend/src/market_data`（`store.py:ParquetStore.save`）。"
---

## 业务意图（解决什么问题）

「一处缺两根」和「整段历史没拉过」在业务上完全不是一回事：前者是采集/落盘链路的**缺陷信号**（实时断流、翻页跳空、回测样本缺失），必须修；后者是**未覆盖范围**（该 series 从未做过深度回灌），修它属于数据工程排期，不该让每次回归都为它红灯。本 fragment 沉淀的正是这条分界契约，以及脚本作为「类型 B 唯一指定修复手段」在修复前后各自要负的责任——包括那条最容易漏掉的收尾规则：**修完必须把 `KNOWN_GAPS` 里的对应条目删掉**。
（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4、`openspec/specs/e2e-data-integrity/spec.md`「缺口三层分类」「已知缺根白名单」）

## 缺口分类契约（脚本必须与门禁同源）

> 判定输入统一是「相邻存活 bar 间隔 ÷ timeframe step」四舍五入后的倍数 `mult`；`mult == 1` 为连续，`mult > 1` 即缺 `mult - 1` 根。

| 类型 | 定义 | 处理方 | 本脚本是否负责 | 契约出处 |
|------|------|--------|---------------|---------|
| A 结构性缺失 | `mult ≥ 5`（整段历史未拉取） | 按需回灌/深度回灌（`backend/src`），测试侧登记 `STRUCTURAL_EXEMPTIONS` 豁免 | **否**（`remaining_b_gaps` 显式过滤掉，只打印不回填） | 规格：「A 类豁免**永不自动清空**（属数据工程范围，不在测试体系内回填）」 |
| B 微缺口 | `1 < mult < 5`（缺 1~2 根） | **本脚本**回填 + `KNOWN_GAPS` 临时登记 | 是（唯一职责范围） | `e2e-data-integrity`「微缺口硬性判定」：白名单之外的 B 类即失败 |
| C 数据停滞 | `now - latest_open_time > 2 * step` | 在线子集断言，后端未运行时 skip；修它是恢复 ingestion，不是补历史 | 否 | `e2e-data-integrity`「数据停滞检测（可选在线）」 |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/tests` | 缺口清单与豁免语义的唯一事实源，脚本以 `sys.path` 注入方式 import 测试包内模块 | `KNOWN_GAPS`、`data_registry` | extracted |
| `backend/src/market_data` | 步长解析、粒度 token、拉取与落盘全部复用生产实现，禁止在脚本里重抄一份 | `timeframe_step_ms`、`timeframe_to_granularity`、`KlineIngestor._fetch_v3_history_page`、`ParquetStore.save/read` | extracted |
| `openspec/specs/e2e-data-integrity`、`kline-history-gap-fill`、`v3-history-channel` | 三层分类、连续升序去重、v3 为主通道等契约的定义处；脚本行为须与之对齐 | 见各 spec Requirement | extracted |

> 反向依赖（谁依赖本脚本的行为）：

| 调用方 | 场景 | 关键说明 |
|-----------|---------|---------|
| `backend/tests/data_registry.py` | 其 docstring 直接写明「all 19 micro-gaps were backfilled on 2026-08-20 via `scripts/backfill_micro_gaps.py`；new micro-gaps must be added here; entries are removed again once backfilled」 | 白名单注释与本脚本互为使用说明书，改其一须同步改另一 |
| `backend/tests/test_data_integrity.py` | B 类硬门禁与 stale 检查构成「登记 → 回填 → 删除登记」闭环 | 脚本若误把 A 类当 B 类回填，会写出非预期分区数据 |

## 典型调用链

### 「报告红 → 登记 → 回填 → 收尾」全流程

```
pytest -m integrity → test_adjacent_spacing_equals_step 报 "unknown micro-gaps: [(lo, hi, mult)]"   ← 跨模块：backend/tests
  → 人工把 (lo, hi) 登记进 data_registry.KNOWN_GAPS["CAT/SYM/TF"]
  → backfill_micro_gaps.py:main                                    ← 本模块入口（唯一消费者）
    → remaining_b_gaps → KlineIngestor._fetch_v3_history_page → ParquetStore.save   ← 跨模块：backend/src
  → pytest -m integrity → test_gap_classification_consistent       ← 白名单必须已删除，否则 stale 失败
```

## 实现约束清单

### 必须遵守的规则（能做 / 禁止做）

| 规则 | 允许 | 禁止 | 由来 |
|------|------|------|------|
| 处理范围 | 仅 `KNOWN_GAPS` 中已登记的区间 | 自动枚举全库、顺手补 A 类整段空白 | 规格把 A 类划为数据工程范围；越界回填会让「豁免表」变成静默的数据写入清单，且单次 v3 拉取的 90 天/100 行窗口本也不适合整段补历史（`openspec/specs/e2e-data-integrity`） |
| 白名单生命周期 | 缺陷出现时登记（`mult` 与 `(lo,hi)` 必须与实测完全一致） | 修完仍留着条目 / 把 `(lo,hi)` 写成缺失 bar 的时间 | 「白名单随数据修复逐步清空」+ `test_gap_classification_consistent` 的 stale 断言 |
| 落库幂等 | 允许同区间重复执行（`save` 按 `open_time` 去重 `keep="last"`） | 绕过 `ParquetStore.save` 直接写 parquet | 图表连续性契约：合并结果 SHALL 严格升序且无重复 bar（`openspec/specs/kline-history-gap-fill/spec.md`） |
| 通道选择 | 仅 `mult < 5` 的小窗口用 v3 单页拉取 | 用受近端深度限制的通道（MCP / v2）判定「交易所无此数据」 | `v3-history-channel`：`earliest_reached` 仅当 v3 最旧窗口重试后仍空才成立——同理，回填脚本的 `EMPTY fetch` 也不能被当作「数据不存在」的证据 |
| 执行环境 | 在 `backend/` 目录、默认数据目录 `data/parquet` 下执行 | 在设置了 `MD_DATA_DIR` 的隔离环境（如 L2 `live_server` 临时目录）执行 | 脚本 `STORE = ParquetStore(Path("data/parquet"))` 为相对路径且不读 Settings |

### 设计决策（记录为何这样分界）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| A/B 分界值 | 固定 `mult ≥ 5` 为 A（三处同源：脚本、测试、`is_exempt` 的 `min_steps`） | 按缺失分钟数/时长设阈值 | 用「步数倍数」对任意 timeframe 自洽；1m 缺 5 根与 1d 缺 5 根在数据工程意义上同为「成段未覆盖」，若改按时长必须同步三处且会破坏与 `STRUCTURAL_EXEMPTIONS` 区间登记的同构性 |
| 是否让脚本自己写白名单 | 人工登记，脚本只读 | 脚本自动发现缺口并自动写入 `KNOWN_GAPS` | 白名单是硬门禁的例外记录，「让被检方自己写例外」会让门禁失去意义；同时脚本的 before/after 复核必须是**独立于白名单的实测**，否则自证循环 |
| B 类是否可由常驻增量任务自愈 | 否，保持人工脚本 | 交给 webapi 增量落盘 scheduler 顺带补 | 增量任务按「已存最新时间之后」补缺口（只向后），不处理历史中间的 1~2 根空洞；把补洞塞进 scheduler 会让每轮落盘都做一次全库 diff，代价与收益不匹配（`openspec/specs/kline-history-gap-fill/spec.md`「webapi 常驻增量落盘」只要求持续写入 + 单目标失败不中断） |

## 变更风险

- 把分界值（5）只改一处 → 三处（`backfill_micro_gaps.TYPE_A_MIN_STEPS` / `test_data_integrity.TYPE_A_MIN_STEPS` / `data_registry.is_exempt(min_steps=5)`）不同步，会出现「脚本判定为 A 而拒绝回填」但「门禁要求登记进 `KNOWN_GAPS`」的死锁红灯，或反向把 B 类整段历史当结构性缺失误豁免（**后果是硬门禁被静默掏空**）。
- 让脚本顺手补 A 类 → 一次执行可能写入数十万根 bar，改变 `STRUCTURAL_EXEMPTIONS` 的区间两端，触发 stale 断言并污染后续缺口基线。
- 修 `data_registry.py` 的元组约定（例如改用「缺失 bar 的时间」或增加第三元素）→ 脚本 `gaps` 解包 `for lo_ms, hi_ms in gaps` 会直接 `ValueError`，且 L1 侧 `g[:2] not in KNOWN_GAPS` 的比较语义同时失效；两侧必须同一 PR 改。
- 该脚本是**测试体系的配套工具**：若把它移出 `backend/scripts`（改路径/改文件名），须同步更新 `backend/tests/data_registry.py` docstring 中对 `scripts/backfill_micro_gaps.py` 的指涉，否则白名单失去使用说明（后果：下一个人不知道该跑什么，白名单长期滞留）。

> 📋 本 fragment 的契约条文摘抄并改写给自仓库 OpenSpec 与测试侧文档：`openspec/specs/e2e-data-integrity/spec.md`、`openspec/specs/kline-history-gap-fill/spec.md`、`openspec/specs/v3-history-channel/spec.md`、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md`（D4 缺口三层分类 / 风险表）、`openspec/specs/history-backfill/spec.md`（按需回灌与 90 天窗口边界），以及 `AGENTS.md`「Test Suite」Notes（Gap registries 说明）。
