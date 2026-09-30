---
type: "Fragment"
id: backend/src/quant
title: "因子、模型与向量回测"
description: "用户自定义因子如何被安全求值、回测为什么不能引用未来 bar、扫描/walk-forward/历史落盘有哪些硬上限？"
parent: /backend/src/_overview.md
fragment: quant
entity_names:
  constants:
    - name: DEFAULT_FACTORS / FEATURE_COLUMNS
      value: "7 个默认因子：log_ret, macd_hist, kdj_j, boll_pos, vegas_dist, roll_mean_5, roll_std_5"
      source: backend/src/market_data/factors.py
    - name: FACTOR_CATALOG
      value: "11 个预设条目（上述 7 个来源算子 + rsi, atr, vol_ratio, mom）"
      source: backend/src/market_data/factors.py
    - name: _EXPR_FUNC_NAMES
      value: "sma, ema, std, pct, rsi, max, min, shift, log, abs, atr, vol_ratio"
      source: backend/src/market_data/factors.py
    - name: _INJECTION_PATTERNS
      value: "__, import, lambda, ;, =, :, [, ]"
      source: backend/src/market_data/factors.py
    - name: train_ratio（默认）
      value: "0.7（前 70% 训练）"
      source: backend/src/market_data/dlquant.py
    - name: thresh（默认信号阈值）
      value: "0.55（proba≥0.55 做多，≤0.45 做空）"
      source: backend/src/market_data/dlquant.py
    - name: fee / slippage（默认）
      value: "0.0004 / 0.0005"
      source: backend/src/market_data/dlquant.py
    - name: min_feature_rows（数据不足门槛）
      value: "50 行（低于则 `insufficient data after features (rows=…)`）"
      source: backend/src/market_data/dlquant.py
    - name: _VALID_MODELS / 参数白名单
      value: "lr, hgb；lr：C/max_iter/solver；hgb：max_depth/learning_rate/min_samples_leaf"
      source: backend/src/market_data/webapi.py
    - name: backtest_history MAX_RUNS / MAX_SERIES_POINTS / MAX_TRADES
      value: "20 / 500 / 2000"
      source: backend/src/market_data/backtest_history.py
    - name: SCHEMA
      value: "vectorbt（记录携带 `schema` 字段；list() 过滤掉 schema 不等于它的旧记录）"
      source: backend/src/market_data/backtest_history.py
    - name: SERIES_LANES
      value: "open_time, equity, drawdown, signal, proba, benchmark"
      source: backend/src/market_data/backtest_history.py
retrieval_hints:
  - "自定义因子表达式是怎么防止注入的？哪些写法一定被拒？"
  - "为什么回测结果不能与手工计算完全一致？（持仓在下一根 bar 才生效）"
  - "walk-forward、参数扫描、因子 IC 分别读哪些端点？"
  - "回测历史记录为什么只留 20 条、曲线为什么被降采样？"
  - "⚠️ 如果你找的是「实时行情/WS 推送」，不在这里，在 `src_realtime.md`"
  - "⚠️ 如果你找的是「BlockBeats 资讯与链上数据代理」，不在这里，在 `src_news.md`"
  - "⚠️ 如果你找的是「回测结果的图表绘制与热力图/ROC 渲染」，不在这里，在 `frontend/src`"
  - "本模块也叫『量化实验室 / QUANT LAB / DL 工作台』，对应需求中的「因子—模型—信号—回测」链路"
  - "架构归属：新算法 MUST 以因子/Model 协议/参数三元组的形式接进既有抽象，不得新建绕过 `dlquant.run_pipeline` 的分析路径"
architectural_role: "量化计算层（因子 → 特征 → 模型 → 信号 → 向量回测 → 历史留存），只读 store 数据，不触外部"
---

## 业务意图

本层解决的业务问题是：**在只有本地历史 K 线、且数据量与请求次数都受限的情况下，让「换因子、换模型、换阈值、换费用」的试验可快速进行且结果可比**。系统的产品前提是使用成本受限的本地环境，因此必须同时满足三点：可复现（同一数据与超参必须给同一结果）、无前视（任何 t 时点的决策不得用 t 之后的信息）、可留存（跑一次就留下一条可比记录，且文件不能无限长大）。本层把这三点做成了唯一的实现路径。

## 对外接口（`## 对外接口`）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|----------|
| `POST /api/dl/features` | client→server | `{category,symbol,timeframe,start?,end?,factors?}`→`{factors:[{id,name,ic,ic_series}]}` | 因子 IC 与逐期时序（Spearman：先排秩再 Pearson，不依赖 scipy） | `webapi.dl_features` → `factors.compute_factors` |
| `POST /api/backtest` | client→server | `{category,symbol,timeframe,factors?,params?,start?,end?}`→`{job_id}` | 长任务必须走后台 job；随后 `GET /api/jobs/{id}` 轮询 | `webapi.backtest` → `_run_backtest` → `dlquant.run_pipeline` |
| `POST /api/backtest/sweep` | client→server | `thresholds`(必填), `fees`?, `slippages`?→`results[]` | 阈值×费用×滑点矩阵（同步计算，不走 /jobs） | `webapi.backtest_sweep` → `dlquant.sweep_params` |
| `POST /api/backtest/walkforward` | client→server | `n_splits`?, `params`? | 多折时序切分回测 | `webapi.backtest_walkforward` → `dlquant.walk_forward_run` |
| `GET /api/backtest/history` / `/{run_id}` / `DELETE /{run_id}` | client→server | `runs[]`（摘要）/ 详情含曲线 | 回测历史留存三件套 | `BacktestHistoryStore.list/get/delete` |
| `factors.evaluate_expr(expr, frame)` | 内部 | 抛 `ValueError` | 白名单表达式求值，非零返回即为拒绝执行 | `factors.py:evaluate_expr` |
| `dlquant.Model(Protocol)` / `SklearnModel(kind)` | 内部 | `"lr"` 默认 / `"hgb"` | `Pipeline(StandardScaler, clf)`，固定种子 `random_state=0` | `dlquant.py:SklearnModel` |
| `dlquant.warmup()` | 内部 | 启动时调用 | 预热 vectorbt/Numba 热路径，避免首测巨慢 | `webapi` lifespan |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `src_analysis` | 因子与特征复用指标列，指标口径变更会改变因子值 | `indicators.compute/ema/rsi/atr/vol_ratio/mom` | extracted |
| `src_data_store` | 特征与回测的数据源，窗口裁剪语义影响样本集 | `ParquetStore.read`、`validate_timeframe` | extracted |
| 第三方 `vectorbt` | 组合回测与 sweep 批量模拟 | `vbt.Portfolio.from_signals` | extracted |
| 第三方 `scikit-learn` | 模型层、`TimeSeriesSplit` | `LogisticRegression`、`HistGradientBoostingClassifier`、`permutation_importance` | extracted |
| `src_api_stores` | 窗口校验与白名单参数校验在此处完成 | `_validate_window`、`_validate_backtest_params` | extracted |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `webapi` | 上述全部端点 | `dlquant.run_pipeline/sweep_params/walk_forward_run`、`compute_factors` |
| `cli backtest` | 本地一次性回测 | `dlquant.run_pipeline` |
| `orchestration.run_retrain` 与 `scheduler` 的 retrain 任务 | 定时重训（仅在 `MD_AGENT_SCHEDULE_ENABLED` 打开时注册） | `run_retrain` |
| `backend/tests/test_dlquant.py`、`test_factors.py`、`test_backtest_history.py` | 无前视、可复现、历史裁剪契约 | — |

## 典型调用链

```
POST /api/backtest {category,symbol,timeframe,factors,params,start,end}
  → webapi._validate_window(start,end)               ← 接口层：起止合法性与顺序，非法 422
  → jobs[job_id] = "running"（超 MAX_JOBS=200 淘汰最早完成的）
  → BackgroundTasks → _run_backtest
      → ParquetStore.read(...)（按窗口裁剪）          ← src_data_store
      → dlquant.run_pipeline(df, factor_defs=…, model=…, train_ratio, thresh, fee, slippage, timeframe)
          → build_features(df, factor_defs) → compute_factors  ← 本模块（NaN 行丢弃、标签下移）
          → time_split(X, 0.7) → SklearnModel.fit(仅训练段)   ← 本模块（无泄漏）
          → signals_from_proba(proba, thresh) → backtest(...)   ← 本模块
      → {metrics, series, trade_list, stats, model_metrics, data_meta, feature_weights, roc_curve}
      → BacktestHistoryStore.save(...)  ← 持久化失败只记日志，不失败
  → 前端轮询 GET /api/jobs/{id}
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `DEFAULT_FACTORS` / `FEATURE_COLUMNS` | 7 个（见 frontmatter）；目录中另有 rsi/atr/vol_ratio/mom 预设 | `factors.py` | `factor_defs=None` 时 MUST 与未配置因子集时输出完全一致 | `openspec/specs/feature-engineering/spec.md`（默认 7 因子行为不变） |
| 注入黑名单 `_INJECTION_PATTERNS` | `__`,`import`,`lambda`,`;`,`=`,`:`,`[`,`]` | `factors.py` | 文本层预检 + AST 白名单双层拒绝；命中即 `ValueError("expression contains forbidden token …")` | `factor-workbench` 要求白名单外一律拒绝 |
| `train_ratio` / `thresh` / `fee` / `slippage` | `0.7` / `0.55` / `0.0004` / `0.0005` | `dlquant.py` | 默认超参与成本口径；改动会使历史回测记录不可比 | 代码默认 + `dl-quant-workbench` 可调参语义 |
| `random_state=0`（所有估计器） | 固定 | `dlquant.py` | 相同数据+超参 MUST 产出相同结果 | `ml-model` 确定性要求 |
| `MAX_RUNS` / `MAX_SERIES_POINTS` / `MAX_TRADES` | 20 / 500 / 2000 | `backtest_history.py` | 文件体积有界（曲线降采样、逐笔裁剪） | `trade-journal` 有界留存规则同源 |
| `SCHEMA` | `"vectorbt"` | `backtest_history.py` | 记录 schema 标记（注意：值与字段名同叫 `schema`） | 代码定义 |
| `SERIES_LANES` / `SCALAR_KEYS` / `TRADE_KEYS` / `DETAIL_KEYS` | 见 frontmatter | `backtest_history.py` | 落盘字段集合；新增字段 MUST 同步 `_meta`/`_detail` | `backtest-engine` 逐笔契约 |
| `422` 响应文案 | `"no data in the requested window (run /candles/backfill first)"` | `webapi.py` | 数据缺失 MUST 给明确提示，禁止静默回退为全量读 | `ml-model` 窗口化要求（不得静默回退） |

### 必须遵守的不变量（本层的「正确性定义」）

| 不变量 | 说明 | 破坏后果 |
|---|---|---|
| **无前视（四处 MUST 同时成立）** | ① 标签用 `close[t+1]>close[t]` 并丢弃无未来的末行；② `shift()` 在 DSL 中只允许**非负**（未来信息即拒），`n<0` 路径已被封；③ 训练 MUST 只用时间前段、标准化 MUST 仅 fit 训练段；④ 信号 MUST 由**样本内（训练窗）**概率生成，walk-forward 各折 MUST 只用该折训练段拟合并用段内概率出信号——绝不允许把**全样本/样本外概率**拿来回测（等价于用未来信息）。最后一项本层实现已落实但源码未加注释警示：**改动任何缩放/拼接 proba 的代码时务必复核**（推断自 `SklearnModel`/`run_pipeline` 与 `train_predict` 的分段逻辑） | 回测指标虚高到不可信，模型上线失效 |
| **交易生效延迟** | `backtest()` 默认按「信号当根收盘成交、最后一根信号不再持仓」的 vectorbt 语义；`signals` 的索引 MUST 与 df 行对齐 | 与 `trade_list` 的 bars/entry_time 口径不一致 |
| **确定性兼容** | 列集合按序 `total_return/max_drawdown/win_rate/trades/bars` + `test_bars`，且 `trades` MUST 保持为**标量交易次数**（不是列表）；`series` 六条 lane（`open_time, equity, drawdown, signal, proba, benchmark`）等长并与 df 行对齐，其中 `proba` 在无模型路径下可缺省 | 前端指标卡与历史详情渲染错位 |
| **逐笔交易字段** | `trade_list` 每条含 `side/entry_time/entry_price/exit_time/exit_price/bars/gross_return/net_return` | 逐笔列表与统计页不可用 |
| **`data_meta` 必填** | `n_train` / `n_test` / `start` / `end`（`run_pipeline` 产出，供前端展示「实际用了哪些 bar」）| 数据窗口不可追溯 |
| **有界留存** | 每次完成回测 MUST 落一条历史；`_trim` 按 `created_at` 升序淘汰至 `MAX_RUNS`；落盘失败只 `logger.exception`，MUST NOT 让 job 失败 | 历史列表丢失或回测接口被存储故障拖垮 |

### 设计决策（存在多种可行方案时记录选型）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|---|---|---|---|
| 因子配置载体 | 「目录实例 `fn` + 数值 params」二选一（`preset`）与「白名单表达式」(`expr`) 共存 | 只开放表达式 | 保证默认 7 因子的字节级向后兼容，表达式只作增量能力 |
| IC 计算 | 不依赖 scipy，用秩上的 Pearson 实现 Spearman | 引入 scipy | 依赖最小化；缺秩的样本先按 `notna` 掩码剔除 |
| 数据不足时 | 明确 `{"error": "insufficient data after features (rows=N)"}` 并由路由层转 422 | 降级用全量 | 规格明确禁止静默回退为全量读 |
| warmup | 把 vectorbt/Numba 重算放进程启动（或 `/jobs/{id}` 内后台预热） | 首次请求时预热 | 避免首个回测被 JIT 拖慢到超时 |
| 长任务 | 走 `POST /backtest` + `GET /jobs/{id}`；同步端点（sweep / walk-forward / features）直接返回结果 | 全部 job 化 | 扫描与特征调用频繁且计算可控，双轨更实用 |

## 边界

- ✅ 可新增预设因子（`FACTOR_CATALOG`）与安全函数（须同时进 `_EXPR_FUNC_NAMES` 与 `_EXPR_FUNCS` 两处）；可换 `Model` 实现（保持 `fit`/`predict_proba` 协议）。
- ❌ 禁止新增表达式函数时只加一处（两处清单分离是刻意的：AST 校验与运行时 env 不同源，漏改即「校验过、执行炸」）。
- ❌ 禁止绕过 `evaluate_expr` 直接对用户提供文本执行 `eval`：表达式里的双下划线、import、lambda、分号与赋值一律拒绝（代码注释明确该文本层预检不能替代 AST 白名单）。
- ❌ 本层 MUST NOT 触碰真实账户（仅纸面；`src_risk_execution.md` 是唯一下单口）。
- ❌ 禁止改 `SCHEMA` 值或随意新增未登记字段，历史详情会读不到旧记录或渲染异常。 （来源: `openspec/specs/backtest-engine/spec.md` 逐笔契约 + `trade-journal` 有界留存）

## 变更风险

- `signals_from_proba` 的默认 `thresh=0.55` 及「空仓信号=0 即平仓」语义改动 → 持仓周期与交易次数剧烈变化；阈值同时是参数扫描的输入维度。
- `factors.py` 的 `shift` 白名单被放宽 → 前视偏差静默引入（单测只测行为，不测「禁止」）。
- 历史字段清单与前端 api types 双端手工同步（无 codegen）：改 `TRADE_KEYS`/`META_KEYS`/`SERIES_LANES` 必须同步前端与 `backtest_history._meta`/`_detail` 的字段集合。
- 把 `MAX_RUNS`/`MAX_SERIES_POINTS` 调大 → `history.json` 膨胀，读取与序列化变慢（设计意图是「有界」）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **无前视是「正确性定义」而非偏好**：特征只用当前及过去 bar；标签在第 t 行 MUST 仅由 `close[t+1]` 与 `close[t]` 决定，且构造后 MUST 丢弃无未来的末行；特征矩阵 MUST 与 sklearn Pipeline（StandardScaler + estimator）兼容且列顺序/命名不变（历史结果与前端诊断视图按列名对齐）。（来源: `openspec/specs/feature-engineering/spec.md`）
- **确定性可复现是硬约束**：sklearn 侧 MUST 固定 `random_state`（同一全局种子），vectorbt 回测路径 MUST 在同输入 + 同参数下产出相同结果（Numba 确定性）——这是回测结果落历史档案并可对比的前提。（来源: `openspec/specs/quant-model-training/spec.md`、`openspec/specs/ml-model/spec.md`、`openspec/specs/quant-engine-vectorbt/spec.md`）
- **切分 MUST 无泄漏且支持多折**：训练索引全部早于测试索引，标准化参数只能由训练集估计；`TimeSeriesSplit` 多折 walk-forward 与单次 `train_ratio` 切分两种形态 MUST 同时可用（前端 `n_splits` 可调、缺省自适应）。（来源: `openspec/specs/walk-forward-training/spec.md`、`openspec/specs/quant-model-training/spec.md`、`openspec/specs/quant-walk-forward/spec.md`）
- **回测语义归 vectorbt，禁止自研等价物**：成交/费用/滑点/持仓语义 MUST 使用 `vbt.Portfolio.from_signals` 与 splitter（range_split / walk_forward）与矩阵广播扫描，MUST NOT 重新维护自定义「信号下一根生效 / 翻仓双边成本 / 末根按市值」逻辑；`trade_list[]` 每条 MUST 含 side、entry/exit 时间与价格、bars、gross_return、net_return，既有标量与曲线键保持不变，且按时间叠加 `net_return` 重构的权益 MUST 与返回的 equity 序列在容差内一致。（来源: `openspec/specs/quant-engine-vectorbt/spec.md`、`openspec/specs/backtest-engine/spec.md`）
- **默认 7 因子是回归基准线**：不提供因子配置时输出特征列与标签 MUST 与既有默认 7 因子完全一致；配置驱动时只返回所列因子列并沿用「丢弃含 NaN 行」的行为（旧配置文件无 `factors` 键时 MUST 无报错按默认处理）。（来源: `openspec/specs/factor-workbench/spec.md`、`openspec/specs/feature-engineering/spec.md`）
- **表达式 DSL 的安全边界**：自定义因子 MUST 以白名单求值（列名、算术、安全函数），含 `__`、方法链 `.`、`import`、字符串字面量或未知函数者 MUST 被拒绝并返回明确错误，且 **MUST NOT 执行任何代码**；同一表达式同一数据两次求值结果 MUST 一致。（来源: `openspec/specs/factor-workbench/spec.md`）
- **模型层可插拔 + 超参白名单**：`Model` Protocol（fit/predict_proba）保留，默认 `lr`（LogisticRegression + StandardScaler），可选 `hgb`（HistGradientBoostingClassifier）；`params` 只接受 lr 的 `C/max_iter/solver` 与 hgb 的 `max_depth/learning_rate/min_samples_leaf`，白名单外或非法取值 MUST 返回 422；结果按存在与否输出 `feature_weights`（coef / importance）与 `roc_curve`（测试集单类时省略该字段且 `roc_auc=null`）。（来源: `openspec/specs/ml-model/spec.md`、`openspec/specs/quant-model-control/spec.md`）
- **回测档案的存储纪律**：每次 `/backtest` job done SHALL 自动落一条历史（含序列引用、参数、指标、逐笔、降采样曲线 ≤500 点/lane、stats/model_metrics 与新字段）；条数上限 20、淘汰最旧；**落盘失败 MUST NOT 影响本次结果返回**（只记日志）；列表端点 MUST 只回轻量元数据、详情回完整记录、未知 id 返回 404。（来源: `openspec/specs/backtest-history/spec.md`）
- **IC 与扫描的接口契约**：`POST /dl/features` 返回各因子 IC（Spearman 秩相关，对下一根方向标签）、`ic_abs`、均值/标准差、**coverage（非 NaN 比例，大部分为 NaN 的因子仍 MUST 列出）**与末行值；`sweep` / `walkforward` MUST 返回 `results`/`folds` 加 `data_meta`，数据不足时返回明确错误供前端空态处理。（来源: `openspec/specs/factor-workbench/spec.md`、`openspec/specs/quant-factor-ic/spec.md`、`openspec/specs/quant-parameter-sweep/spec.md`）
