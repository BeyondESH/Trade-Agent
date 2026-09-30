---
type: "Fragment"
id: backend/tests/offline_quant_trading
title: "全栈 E2E 测试门禁层 / 量化与交易离线不变式"
description: "回测是否防未来函数、实盘闸门是否有双确认、熔断与自学习闭环如何被断言？"
parent: /backend/tests/_overview.md
fragment: offline_quant_trading
entity_names:
  constants:
    - name: MAX_RUNS
      value: "20（回测历史最多保留条数，超出逐出最旧）"
      source: backend/tests/test_backtest_history.py（导入自 market_data.backtest_history）
    - name: MAX_SERIES_POINTS
      value: "500（曲线保存时的降采样上限）"
      source: backend/tests/test_backtest_history.py
    - name: NEWS_DIGEST_CATEGORIES
      value: "crypto, macro（默认只注入这两类）"
      source: backend/tests/test_agent.py
    - name: NEWS_DIGEST_HOURS
      value: "24"
      source: backend/tests/test_agent.py
    - name: NEWS_DIGEST_MAX_ITEMS
      value: "10"
      source: backend/tests/test_agent.py
    - name: DEFAULT_FACTORS
      value: "内置因子集（未指定因子时的默认列，含快照指标）"
      source: backend/tests/test_factors.py
    - name: 建议阈值样本数
      value: "6 笔全亏才产出 suggest_param_adjustments（1 笔 → {}）"
      source: backend/tests/test_memory.py
    - name: min_strength 建议值
      value: "\"+1\"（低胜率时的参数建议）"
      source: backend/tests/test_memory.py
    - name: 默认 broker
      value: "PaperBroker（ExecutionEngine() 不传 broker 时）"
      source: backend/tests/test_execution.py
    - name: 下单规模换算
      value: "size = notional / price（例：equity*margin → notional 5000 @100 = size 50）；long → buy"
      source: backend/tests/test_execution.py、test_webapi.py
    - name: 编排周期基准
      value: "ProviderConfig(near_pct=0.01, min_strength=2) + 120 根 5m bar 贴近支撑"
      source: backend/tests/test_orchestration.py
retrieval_hints:
  - "回测为什么不会因为最后一根 K 线发出信号就成交？哪条断言在守？"
  - "因子表达式 DSL 允许什么、禁止什么（如何挡代码注入）？"
  - "训练/测试切分怎样保证不泄漏未来数据？Walk-forward 的折序是什么？"
  - "什么条件下实盘单会被闸门拦住，连交易所都不调用？"
  - "熔断触发后谁负责平仓、事件日志写什么、能否重复执行？"
  - "Agent 的记忆闭环（记录→反思→检索→再决策）是怎么被测试串起来的？"
  - "⚠️ 如果你要找 HTTP 层的下单/确认状态码，不在这里，在 tests_webapi_contract.md 与 tests_l2_live.md"
  - "⚠️ 如果你要找 Parquet/实时流的读写语义，不在这里，在 tests_offline_data_stream.md"
  - "⚠️ 如果你要找数据缺口/新鲜度门禁，不在这里，在 tests_l1_integrity.md"
  - "新增风控/执行/Agent 的单元测试请写进 test_risk/test_execution/test_agent/test_orchestration，不要新建平级文件"
architectural_role: "离线单元层（决策域）；把「不预测未来、不动真钱、失败可控」三件事固化为断言"
---

## 覆盖文件与对应不变式（9 个源文件）

| 文件 | 锁定的业务不变式 |
|------|-----------------|
| `test_analysis.py` | 指标数学正确性（EMA/MACD/RSI/ATR/KDJ/BOLL/斐波那契）、数据不足时返回 NaN 而非抛错、**无未来函数**（bar i 的输出不受 i+1 之后数据影响）、同一输入两次计算完全一致、结构引擎（swing/box/trendline）、SMC（order block / BOS / CHoCH / 流动性池）、支撑阻力按强弱排序与分类 |
| `test_dlquant.py` | 特征与标签形状、`SklearnModel` 确定性（同数据同权重）、支持模型集合与未知模型拒绝、标准化开关、HP 透传、`time_split`/`walk_forward_splits` 的严格时序、训练/测试不泄漏、向量口径回测（成本侵蚀收益/回撤、最后一根不发成交、`trade_list` 字段契约、`init_cash` 与风险敞口只缩放权益、无未来收益）、基准对比与逐折汇总 |
| `test_factors.py` | 表达式白名单 DSL：合法表达式与等价 numpy 结果一致、**注入必须被拒**、未知列/函数报错、缺数据传播 NaN、自定义因子集只产出所选列、因子参数 round-trip、默认集与自定义集在 `/backtest` 结果上的等价性 |
| `test_backtest_history.py` | 历史落盘/读取 round-trip、最新在前、删除、`MAX_RUNS` 逐出、`MAX_SERIES_POINTS` 降采样、损坏/缺字段旧记录容错、新增强字段（stats / model metrics / data_meta）向后兼容 |
| `test_risk.py` | 仓位 sizing（每仓预算、总敞口、单币上限、杠杆与保证金的 clamp）、`max_adds` 拦截、「portfolio full → 拒绝新开仓、允许减仓」、回撤熔断、参数校验拒绝非法值 |
| `test_execution.py` | 纸面开/平仓记账（含费用）、**风险预检拒绝即不成交且不记 add**、熔断阻断下单、`RunControl` 三态（`paper_only`/`live_enabled`/`confirmed`）、实盘的**双重闸门**（未启用或用户未确认则连交易所都不调用）、`long → buy` 方向归一、下单量计算、成交失败/查询失败的处理、纸面与实盘隔离，平仓成交回报（成交优先 → 入参 → 查询 → 两者皆无=0 且不动权益、查询失败上抛且不更新权益）|
| `test_agent.py` | 规则型决策（贴近支撑做多/贴近阻力做空/远离或无信号则 hold）、LLM provider 的 JSON 抽取与畸形输出回退、`AgentDecision` 字段契约、上下文形态（price/indicators/levels/news）、**news 可选且默认为空**、摘要器按类别与时间窗筛选 + 条数截断 + 总字数截断 + 空输入兼容、开/平/持有路由到风控、配置校验、provider 工厂 |
| `test_memory.py` | 交易日志 round-trip 与仅闭合交易、特征向量相似度高低、按 `k` 召回 + 方向过滤、无历史时召回为空、反思（启发式 + LLM 失败回退）、低胜率给参数建议（样本不足不给建议）、规则蒸馏、`augment_context` 注入 memories/rules 且原始字段保持不变 |
| `test_orchestration.py` | **记忆闭环**（开仓 → 平仓 → 反思 → 可召回）、上下文被记忆与规则增强、news provider 注入与显式 news 覆盖默认、显式 `complete` 注入否则启发式兜底、kill switch 停机、默认仅纸面、组合满仓时开仓被拒、调度器任务注册（默认仅熔断；Agent 调度开启时加 agent_cycle/run_control 任务）、任务异常隔离、熔断任务**幂等** + 缺价跳过并继续、熔断不受 kill switch 阻断 |

## 对外接口

本子模块不对外提供服务接口（测试文件不被任何生产代码 import），但它对开发/CI 暴露两类稳定契约：

| 契约 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `python -m pytest -q`（默认子集） | 开发者/CI → 本模块 | 排除 `integrity`/`live`/`online` | 本组用例是默认子集的主体，MUST 离线全绿且不启进程 | 各 `test_*.py` |
| `python tests/test_x.py` | 开发者 → 本模块 | 需 `PYTHONPATH=src`、CWD=`backend/` | 最小冒烟入口；marker 门控失效，非并行安全 | 各文件 `_run_all()` |
| 决策口径契约 | 本模块 → `backend/src` | 无未来函数、风控先判后成交、实盘双闸、失败回退 | 端点层与前端直接依赖这些口径；改动本组断言等于改动产品口径 | `backtest`、`RiskEngine.check_order`、`ExecutionEngine.place`、`AgentCycle.step` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src`（indicators / structure / smc / levels / dlquant / factors） | 被断言的量化引擎 | `compute`、`find_swings`、`bos_choch`、`build_features`、`backtest`、`evaluate_expr` | extracted |
| `backend/src`（risk / execution / events） | 风控闸与执行账本 | `RiskEngine.check_order`、`ExecutionEngine.place`、`LiveBroker`、`EventLog` | extracted |
| `backend/src`（agent / llm / memory / orchestration） | 决策与自学习闭环 | `build_agent_context`、`format_news_digest`、`TradingAgent`、`AgentCycle`、`build_orchestrator` | extracted |
| `backend/src`（mcp_client） | 实盘成交回报的成功/失败/缺字段三态需假 client | `McpError`、`call_tool` | extracted |
| `backend/tests/offline_data_stream`（同模块） | 种子 DataFrame 的时间基准与 `timeframe_step_ms` 语义共享 | `BASE`/`STEP` | extracted |

> 反向依赖（谁依赖本子模块的结论）：

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `tests_webapi_contract` / `tests_l2_live` | `/backtest*`、`/agent/*`、`/order*`、`/control` 等端点用例的正确性预期以本组的引擎断言为准 | `run_pipeline`、`AgentCycle`、`ExecutionEngine.place` |
| `frontend/src` 量化工作台与 Agent 页 | 曲线点数、参数建议、信号标记等 UI 契约都由这些断言定义 | `MAX_SERIES_POINTS`、`suggest_param_adjustments` |
| `openspec/specs`（backtest-engine / risk-position-model / agent-cycle / execution-core / live-safety / circuit-breaker-enforcement / drawdown-circuit-breaker） | 验收清单映射到本组文件 | 各 Requirement 名 |

## 典型调用链

### 回测的防未来函数（最易退化的不变式）
```
POST /backtest → run_pipeline(store_df, factors|expr, params, window)
  → dlquant/build_features(df)                    ← 标签取「下一根方向」，特征只用 ≤t 数据
    → time_split / walk_forward_splits            ← train 段索引严格小于 test 段（无重叠、时序不倒退）
      → train_predict(SklearnModel)                ← 折内拟合，禁止用到 test 段
        → backtest(df, signals, fee, slippage)     ← 信号在第 i 根 → 于第 i+1 根成交；末根有信号必不成交
          → series.equity 严格非降 + total_return == (末值 - 初值) / 初值（可手算一致）
```

### 纸面下单经风控闸门
```
ExecutionEngine.place(order, price)                ← 本模块入口
  → RunControl.enabled / kill_switch（或 paper_only / live 确认）判定
    → RiskEngine.check_order(portfolio, symbol, leverage, adds)   ← 跨模块：risk 闸门
      → 拒绝 → Fill(ok=False)，且【不】record_add、【不】触发交易所调用
      → 通过 → PaperBroker 记账（size = notional/price、long→buy、扣费用与滑点）
        → Portfolio/Position 更新 → TradeJournal 记录 → memory 侧可检索
    → 回撤 > max_drawdown → 熔断：写 EventLog(kind=circuit_breaker, action=blocked/enforce, symbols=[...]) 并阻断下单
```

### 编排循环里的记忆与熔断
```
build_orchestrator(...) → APScheduler jobs: {circuit_breaker[, agent_cycle, run_control...]}
  → AgentCycle.step(df, symbol, tf, price)
    → decide → augment_context(memories, rules, news)   ← 显式 news 覆盖默认 provider
      → ExecutionEngine.place(...)                       ← 跨模块：execution/risk
        → close_position → journal.closed()[0].reflection → memory_store.retrieve(features, k)
  → run_circuit_breaker(...)（独立于 agent 调度，也【不】受 kill_switch 阻断；重复执行为 no-op）
```

## 实现约束清单

> 实现本组用例或其守护的功能时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| 风险参数族 | `margin_pct`/`total_margin_pct`/`max_symbol_margin_pct`/`max_adds=3`/`lev_cap`（非法即 `ValueError`） | `test_risk.py` | 每个闸门的边界都必须有一用例：clamp 而非报错的（leverage）、直接拒的（no room）、可部分减的（allow reduce）三种语义不可互换 | 风控语义混用会造成「该拒的放行」或「该放行的报 400」 |
| 熔断阈值 | `max_drawdown`（> 阈值即 `circuit_breaker` 事件） | `test_risk.py`、`test_execution.py` | 熔断必须在**下单前**拦截，并写事件日志 | 见 `circuit-breaker-enforcement` |
| 实盘闸门 | `paper_only=True` 默认 + `live_enabled` + `confirmed` 三层 | `test_execution.py` | 任一层不满足 → **不调用交易所**（假 client 的 `calls == []` 是断言的一部分） | 「默认纸面」是全局安全声明（`wire-kill-switch-and-reset`、`live-safety`） |
| 因子白名单 | 仅允许列名 + 白名单函数（`sma`/`rsi`/`log`/... ）；`__import__`、属性访问、任意名字必须被拒 | `test_factors.py` | 表达式来自前端输入，属不受信任输入 | 代码注入会直接执行在服务端进程 |
| 历史规模上限 | `MAX_RUNS=20`、`MAX_SERIES_POINTS=500` | `test_backtest_history.py` | 曲线保存前降采样；旧记录缺新字段 MUST 可读（不得抛） | 面板要「可比较/可回放」，同时不能把用户历史挤爆 |
| news 摘要上限 | `NEWS_DIGEST_HOURS=24`、`NEWS_DIGEST_MAX_ITEMS=10`、分类 `("crypto","macro")` | `test_agent.py` | 摘要还有 `max_chars` 总字数截断（截断后长度精确等于上限） | 上下文膨胀会拖慢并抬高 LLM 成本；分类白名单防无关新闻污染决策 |

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `test_indicator_no_lookahead` / `test_features_shapes_and_nolookahead` / `test_backtest_no_lookahead_and_metrics` | `test_analysis.py`、`test_dlquant.py` | 三条「未来函数」守卫，任一缺失即等于放弃过拟合防护 |
| `test_walk_forward_splits_no_leak` / `test_walk_forward_run_folds_ordered` | `test_dlquant.py` | 分折时序与折序断言；滚动训练的可信度基础 |
| `test_expression_rejects_injection` | `test_factors.py` | 黑名单式必须持续扩列（新增可调用名时同步） |
| `test_live_blocked_when_not_enabled` / `test_live_blocked_when_not_confirmed` | `test_execution.py` | 断言含「client 未被调用」，不只是「返回失败」 |
| `test_run_circuit_breaker_closes_journals_and_is_idempotent` | `test_orchestration.py` | 幂等 + 日志闭合是资金安全的第二道闸 |
| `test_jobs_isolate_failures` | `test_orchestration.py` | 单任务抛错不得拖垮调度器（否则后端会「看起来活着但什么都不做」） |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 回测成本与成交价的表达 | 信号在第 i 根、成交只发生在第 i+1 根的区间价内，且成本以 `fee`/`slippage` 进入 | 信号即时按当根 close 成交 | 即时成交等价于「用未来价格决策」，会产生不可能的高收益曲线 |
| 未知因子输入的处置 | 白名单 + 抛错（不静默降级为默认因子集） | 遇到非法名字回退默认集 | 回退会让用户以为「我的表达式在起作用」，结果不可复现 |
| 风险被拒不成交 vs 部分成交 | 杠杆类**clamp 后继续**（记 `reasons`）、余量类**拒绝**、允许只减仓 | 全部 400 | 既保证不突破资金闸，又不因「杠杆填了 200」直接让用户无法操作 |
| 熔断的触发者 | 调度器任务 `run_circuit_breaker`（与 Agent 调度解耦，且在 kill switch 下仍执行） | 由 Agent 循环或前端触发 | 拉闸停的是「策略」，不是「护仓盘」；把平仓做成幂等 + 缺价跳过，保证多轮重试最终清仓而不卡死 |
| news 进入上下文的方式 | `format_news_digest`（分类白名单 + 时间窗 + 条数 + 总字数四重截断），显式 `news` 参数覆盖 provider | 直接拼全部条目 | 上下文预算是硬约束；也让「同输入同输出」的单元断言可成立 |
| 记忆召回的特征来源 | `features_from_context` 生成固定小向量 + 余弦相似度 | 用文本 embedding | 需保持离线确定性，避免引入外部模型 |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

决策类代码有一个独有缺陷模式：**它几乎总能跑通，只有结果好坏**。指标少给一根数据不会崩、用未来一根价格成交也只会让曲线更漂亮、因子表达式走 `eval` 也不会立刻出事，只会在某天在服务端执行了一段前端输入。因此本组断言的重点不是「能算出什么」，而是「不许以什么方式算出来」。具体表现为三类断言：数学等价（numpy 手算 vs 引擎输出，证明实现没有走偏）、时序合法性（无未来函数、训练段严格早于测试段、信号在下一根才生效、末根不成交）、安全闸门（风控拒绝不得记账，实盘未确认不得触达交易所）。任何以「简化」为名的改动都会打破其中一类，所以这三类里挑一类删掉是典型高危操作。

第二类尤其需要解释：它为什么在决策域比任何性能指标都重要。一次带未来信息的回测不会报错，它只会给出一条比现实好的收益曲线，进而污染参数建议（网格与滚动训练都依赖同一条曲线）、Agent 的决策置信度与资金分配。这类污染的代价要等到真钱放上去才显现，所以「防未来」必须作为可执行断言长期存在，而不是代码评审的口头约定。也因此本组的实现大量采用「**刻意构造的数据形态**」：用一条严格上升的 close 序列使「方向 = 1」成为必然，用一个已知折点使 SMC 结构、支撑位与止损距离成为唯一解，用「全部亏损」的序列使反思与建议必然触发。构造数据是断言可读、可推、可手算的前提；用真实行情跑「看起来通过」是这一层最没价值的写法。

第三类断言里的**「未被调用」比「返回失败」更硬**：`client.calls == []` 是实盘闸门唯一的客观证据。只看返回值的断言挡不住「先下单再判断」的实现，而后者恰是资金事故的真实形状——同理，「熔断任务不受 kill switch 阻断」看似反直觉（用户都拉闸了为什么还平仓），但拉闸停的是策略，不是护仓盘；把这句话写成断言，是因为它很容易被后来的「统一走 can_trade()」式重构悄悄抹掉。

### 本组与相邻层的责任边界

本组不断言 HTTP 状态码与 WS 帧格式（`tests_webapi_contract.md`），也不断言数据良否（`tests_l1_integrity.md`）；它声明的是「引擎与闸门的语义」。一个值得警惕的错位是：Web 层用例与端点契约的冲突属前者责任范围，而本组一旦开始加端点断言就说明职责越界，应该下沉回引擎层。外部服务（LLM 补全、MCP 下单、成交回报查询）一律以注入点驱动，包括失败注入——成功、失败与缺字段三态必须都有，因为「缺字段时猜一个价」正是资金记账类 Bug 的高发地。



**变更风险（改这组断言会破坏什么）**

- 允许「末根信号当根成交」或改成「以 close 成交」→ 回测收益曲线虚高，前端策略评估与参数建议全部失去参考意义；`test_backtest_last_bar_signal_no_trade`、无未来函数用例即红。
- 因子 DSL 为「方便用户」接入 `eval`/`getattr` → 服务端任意代码执行；白名单用例是本条唯一防线。
- 用 `total_return`/`max_drawdown` 的**手算口径**替换 numpy 口径（或反之）→ 与前端展示、历史曲线对账不一致。
- 放宽成交价的区间校验（允许 `entry_price` 落在 bar 区间外）→ 纸面成交比真实市场更好，导致「纸面赚钱、实盘亏损」。
- 把 `test_*_no_lookahead` 类断言改成「只要不抛错就算过」→ 数据不足时的 NaN 与污染未来数据两类缺陷混为通过。
- 熔断从「调度器任务」改为「agent 内部触发」→ Agent 被 kill switch 停用时仓位不再被平，回撤失控；`test_circuit_breaker_job_not_blocked_by_kill_switch` 专门守这一点。
- 把「LLM 输出解析失败」改成抛错 → Agent 页与 `/agent/cycle` 在外部模型抖动时全红；必须走结构化解析 + 启发式兜底 + `fallback` 标记。

### 失败模式复盘（本组各自拦住哪一类事故）

- **末根成交**：把信号当成在产生它的那根成交，等于用该根收盘价（甚至更高）买入；曲线立刻好看几分。`test_backtest_last_bar_signal_no_trade` 与「信号下一根生效」两条断的是同一件事。
- **成本被吃掉**：`fee`/`slippage` 未参与撮合时，高换手的因子在 UI 上看起来比低换手的更好，参数扫描与网格搜索会把策略推向高频噪声。必须有「同一信号，成本越大总收益越低」的量级断言（来源: `openspec/specs/backtest-engine/spec.md`、`openspec/specs/quant-engine-vectorbt/spec.md`）。
- **DSL 注入**：因子表达式来自前端输入。白名单一旦为了「让用户写更自由的公式」放开属性访问或内建函数，等于把服务端进程交给浏览器。本组的注入用例（模块导入、属性访问、任意名字）是安全边界，不是功能用例，MUST NOT 被当作过度设计删除。
- **风控拒绝却记账**：拒绝时若仍 `record_add` 或写入持仓，加仓次数会虚增（表现为「明明没成交却不让我再下单」），更糟的是账实不符（本层纸面账与真实仓位偏离）。所以断言同时包含「未成交」和「未入账」两半——后者比前者更容易漏。
- **闸门变成返回值检查**：只断返回失败而不断「上游未被调用」的实盘测试会在重构后悄悄失效（先下单再判断）。`client.calls == []` 才是本组实盘断言的核心。
- **熔断被总开关挡住**：把熔断挂到 `can_trade()` 下看似合理，实际后果是「拉停策略时不再护盘」，仓位在无人管理时继续扩大回撤；熔断任务必须独立于 kill switch，且幂等（二次执行不得重复平仓、不得重复写日志）。缺价标的跳过并留待下一轮，保证一个取不到价 symbol 不会卡住其余平仓动作。
- **失败即抛错**：LLM 解析、成交回报查询、成交回报本身失败，三者的正确反应都不同（回退启发式 / 回落入参 / 上抛且不动权益）。把它们统一成「抛错」看似严谨，实际会让一次模型输出不干净变成整个循环崩掉。

本组也界定了「不得侵入」的底线：需要真实外部模型或交易接口才能通过的断言 MUST NOT 出现在这里；`online`/L2 才是它们的位置。同样地，如果本组开始断状态码、开始断 JSON 帧字段名，就说明它越到了 Web 契约层，应把断言交还给 `tests_webapi_contract.md`。

把本组的断言按「失去它之后的后果」排序，可以解释为什么它们值得长期供养：第一位是安全闸门类（未确认不得触达交易所、风控拒绝不得记账、熔断不受总开关阻断）——失效代价是真钱；第二位是时序合法性类（无未来函数、训练段早于测试段、信号下一根生效、末根不成交）——失效代价是「结果仍然产出，但比现实好」，属于最难自证最难被发现的一类错误，正因如此本组要求每条时序断言都能靠**构造数据手算**验证；第三位是数值口径类（总收益等于期末除期初、成本单调降低收益、`init_cash` 缩放曲线形状不变），它们直接决定 UI 上「这个策略好不好」的结论能否复现。任何人想精简本组用例时 SHOULD 按此顺序保留，而非按文件长度平均删。

另一条反复出现的写法值得单独点出：本组几乎所有「拒绝」语义都用「双重断言」表达——既断返回值/状态（未成交、无 token、403/422/400），也断**副作用未发生**（持仓字典仍空、`calls` 仍空、事件计数未增、journal 未闭合）。只看返回值的断言挡不住「先做事再判断」的实现，而这正是资金与状态类 Bug 的真实形状；只看副作用又会在「什么都没做但也没拒绝」的静默失效面前失明。写新的决策类用例时，两半都要有。

**边界约束（什么能做、什么禁止）**

- **禁止**为通过 `test_data_integrity` 而把这些单测改成弱断言或加 `skip`（三层职责互不替补，缺口属数据域；数值口径属本域）。
- **禁止**在这组用例里触真实 LLM、真实 Bitget 交易接口或真实 MCP 子进程；外部一律假 client / `complete=` 注入（来源: `test_execution.py::live close broker`、`test_agent.py` provider 工厂）。
- **必须**保持纸面为默认（`paper_only=True`）与实盘双确认；新增交易通道也要落同一 `RunControl` 三态判定。
- **必须**为「拒绝」与「clamp」分别留用例：同一个请求，风控可能因不同原因给出 200（带 `reasons`）/400/403，混淆即语义漂移。
- **禁止**在测试中直接 `from tests import ...` 或新建公共测试包；跨文件复用靠 `conftest.py`（与既有惯例一致），避免与 `testpaths = ["tests"]`/`python tests/test_x.py` 的双运行方式冲突。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/backtest-engine/spec.md`、`quant-engine-vectorbt/spec.md`、`feature-engineering/spec.md`、`risk-position-model/spec.md`、`risk-checks/spec.md`、`live-safety/spec.md`、`execution-core/spec.md`、`circuit-breaker-enforcement/spec.md`、`agent-cycle/spec.md`、`agent-context/spec.md`、`ai-agent-strategy/spec.md`、`memory-retrieval/spec.md`、`reflection-engine/spec.md`、`trade-journal/spec.md`

- **回测真实性**：成本（手续费 + 滑点）MUST 计入；成交 MUST NOT 用未来信息；`series.equity` 与 `total_return` 的口径 MUST 可手算核对；点数 MUST 降采样到展示尺度。
- **风险与仓位**：保证金/总敞口/单币上限/加仓次数/杠杆上限五道闸；被拒 MUST NOT 记账；部分余量 MUST 允许减仓而非全盘拒绝。
- **实盘安全**：默认纸面；实盘开启需 `live_enabled` + 用户确认双条件；未满足时 MUST NOT 触达交易所（本组以「假 client 调用列表为空」证明这一点）。
- **熔断执行**：熔断 SHALL 由调度器任务独立承担，MUST 幂等、MUST 在 kill switch 下仍运行、缺价标的 SHALL 跳过并在后续轮次重试，且每次动作 MUST 落事件日志（`kind="circuit_breaker"`，含 `blocked`/`enforce` 两类 `action`）。
- **Agent 上下文与自学习**：上下文 MUST 只读；`news`/`memories`/`rules` 均为可缺省增强项且不得破坏既有字段（`price`/`indicators`/`levels`）；决策 MUST 经风控再执行；反思缺 LLM 时 MUST 回落启发式。
- **下单前风控的校验顺序与可解释性**：`RiskEngine` MUST 按「杠杆上限 → 单币加仓次数上限 → 单币保证金上限 → 组合总保证金上限」顺序校验，结果 MUST 可解释（通过/缩减/拒绝三种终态 + `reasons`）。所以 `test_risk.py` 不只要断“能不能下单”，还断「终态种类 + 原因非空」：只断布尔值会让「拒绝但原因丢失」的回归通过（来源: `openspec/specs/risk-checks/spec.md`「下单前风控校验」）。
- **记忆检索的离线约束**：相似交易检索 SHALL 返回 Top-K 并支持按方向过滤，相似度计算 MUST NOT 依赖外部嵌入模型——因此本层用 `features_from_context` 的固定小向量 + 余弦相似度，任何引入 embedding 的重构都属越界（同时会破坏「不联网」约束）（来源: `openspec/specs/memory-retrieval/spec.md`）。
- **参数建议只产出不生效**：`suggest_param_adjustments` 在样本不足时 MUST 返回空建议（本层 `1 笔 → {}` vs `6 笔全亏 → {"min_strength": "+1"}`），且建议 MUST NOT 被自动应用。测试里只能断建议字典内容，**禁止**加「参数已被改变」类副作用断言（来源: `openspec/specs/reflection-engine/spec.md`「参数自调建议」）。
- **LLM 不得臆造技术位**：Agent 的 S/R 与技术态势 MUST 由确定性算法产出后再交给 LLM（levels 条目带 `sources`，如 `swing`/`fib`）；LLM 输出不可解析时 MUST 回退为 `hold` 并在 `reason` 里留 `fallback` 标记（本层 `test_llm_fallback_on_garbage`）（来源: `openspec/specs/ai-agent-strategy/spec.md`、`openspec/specs/agent-decision/spec.md`）。

**本节逐条来源对照**

> （来源: `openspec/specs/backtest-engine/spec.md`）
> （来源: `openspec/specs/quant-engine-vectorbt/spec.md`）
> （来源: `openspec/specs/risk-position-model/spec.md`）
> （来源: `openspec/specs/risk-checks/spec.md`）
> （来源: `openspec/specs/memory-retrieval/spec.md`）
> （来源: `openspec/specs/reflection-engine/spec.md`）
> （来源: `openspec/specs/ai-agent-strategy/spec.md`）
> （来源: `openspec/specs/live-safety/spec.md`）
> （来源: `openspec/specs/execution-core/spec.md`）
> （来源: `openspec/specs/circuit-breaker-enforcement/spec.md`）
> （来源: `openspec/specs/agent-cycle/spec.md`）
> （来源: `openspec/specs/agent-context/spec.md`）
> （来源: `openspec/specs/trade-journal/spec.md`）
