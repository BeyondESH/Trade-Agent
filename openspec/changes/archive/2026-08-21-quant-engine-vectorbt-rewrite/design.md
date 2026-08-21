# quant-engine-vectorbt-rewrite — Design

## Context

当前量化引擎是自维护的轻量实现(`backend/src/market_data/`):
- `dlquant.py`: `build_features` → `LogisticRegressionNP`(手写 numpy LR)→ `time_split` → `signals_from_proba` → 手写向量化 `backtest()` + `_extract_trades`
- `indicators.py`: 自实现 MACD/KDJ/BOLL/VEGAS/RSI/ATR/vol_ratio/mom,`factors.py` 的预设目录与白名单 DSL 深度依赖其函数签名
- `webapi.py`: `/backtest`(后台任务)、`/dl/features`(因子 IC),均读全量序列,无 `start/end` 窗口
- 前端 `DlQuantTab` 系列组件:硬编码周期 `["1m","1h","4h","1d"]`,无时间区间选择
- 既有测试: `test_dlquant.py` 含 7 条自定义回测语义测试;`ml-model`/`walk-forward-training`/`technical-indicators`/`backtest-engine`/`feature-engineering` specs 定义确定性、无前视等要求

决策:接受 vectorbt v1.x 标准语义,全量重写回测/指标/模型三层,并补齐任意区间×周期选取。环境已就绪(py3.14.6 / pandas 3.0.5 / numpy 2.5.1,与 vectorbt 1.1.0、scikit-learn 1.9 要求吻合)。

## Goals / Non-Goals

**Goals:**
- 以 vectorbt Portfolio/splitter/signals/returns 替换手写回测链路,接受其标准语义
- 指标计算迁移到 vectorbt Indicator,保持对外函数签名稳定以隔离对 `factors.py` 的冲击
- 模型层迁移到 scikit-learn(Scope B),保留 `Model` Protocol 插拔接口与确定性
- `/backtest`、`/dl/features` 支持任意时间区间与全部有效周期;前端提供区间/周期选择器
- 依赖显式化(numpy/vectorbt/scikit-learn/quantstats),全部通过既有三层测试回归

**Non-Goals:**
- 不迁移 `store.py`(parquet 存储/读取保持不变)
- 不引入 TA-Lib / pandas-ta / alphalens / optuna
- 不实现 vectorbt PRO 特性(限价单、杠杆、并行化)
- 不改变交易执行/agent 编排层
- 不保留旧引擎的自定义回测语义(明确作废)

## Decisions

### D1: 依赖与版本

在 `pyproject.toml` 显式声明 `numpy`、`vectorbt>=1.1`、`scikit-learn>=1.9`、`quantstats`;安装后在 py3.14.6 venv 验证 wheel 并固定锁定版本。vectorbt 会带入 `numba`(JIT)与 `scipy`。

**备选**: 不引入 vectorbt,继续维护手写引擎 → 被否决,成熟度/参数扫描/交易分析能力不足。

### D2: 回测重写为 vbt.Portfolio(接受标准语义)

将 `dlquant.backtest()` 整体替换为 vectorbt Portfolio:
- 信号映射:`signals_from_proba` 保持为信号生成器,产出多头/空头信号矩阵
- `vbt.Portfolio.from_signals(close, entries, exits, fees=…, slippage=…, freq=…, direction=…)` 构造组合
- `freq` 由 `timeframe` 推导(1m/1h/4h/1d → 对应 pandas offset),保证时间相关指标正确
- 绩效:用 `pf.stats()`、`pf.drawdown`、`pf.trades` 等替换手写 equity/drawdown/trade_list

**无前视保障**: 旧引擎通过 `shift(1)` 让持仓下一根生效。vectorbt 的成交时机由 `freq`/`price`/延迟参数决定;设计上必须确保"信号在第 t 根,成交不早于 t+1 根"。实现时以测试锁定(见 R5),具体参数(`delay`/`price`/`size`)在实现阶段用确定性测试验证后固化。

**备选**: 在 vectorbt 上复刻旧语义(信号 shift、双边费用补偿)→ 被否决,用户已确认接受标准语义,不复刻。

### D3: 指标迁移到 vbt.Indicator,保持函数签名

`indicators.py` 对外签名保持不变(`rsi(close,n)->Series`、`atr(h,l,c,n)->Series`、`compute(df)->df` 等),内部实现改为 vectorbt Indicator(RSI/ATR/BBANDS/MACD/STOCH 等)。这样 `factors.py` 的预设目录与白名单 DSL 零改动,风险最小。

vectorbt 没有的指标(VEGAS 通道、KDJ-J、斐波那契回撤)保留为薄包装(基于 ewm/rolling),不作为独立 vbt.Indicator 重写。

**备选**: 因子 DSL 整体迁到 vectorbt 表达式体系 → 被否决,`factors.py` 是已 spec 化的稳定资产,不值得为此重写。

### D4: 模型层迁移到 scikit-learn

新增 `SklearnModel` 适配器实现 `Model` Protocol(fit/predict_proba),内部为 `Pipeline([("scaler", StandardScaler()), ("clf", estimator)])`:
- 默认 `LogisticRegression`(确定性),可选 `HistGradientBoostingClassifier`
- `random_state` 固定(或 `SKLEARN_SEED` 全局种子)满足 ml-model 确定性 spec
- `time_split` 升级:模型侧用 `TimeSeriesSplit` 多折 walk-forward,回测侧用 vectorbt splitter(range_split/walk_forward),两层分工
- `train_predict` 增加可选评估输出 `roc_auc`/`log_loss`

**备选**: 继续手写 numpy LR → 被否决,无法获得 CV/指标/模型库能力。

### D5: 数据窗口与周期选取

- `BacktestBody`/`FeaturesBody` 增加可选 `start`/`end`(UTC ms),`webapi._read` 透传给 `store.read`(已支持窗口剪枝)
- 区间校验: `start < end` 且与数据有交集,否则返回明确错误
- 周期合法性复用 `models.py` 的 14 个有效级别(排除实时专用 `1s`),前端周期列表由此生成(硬编码常量改为共享来源)
- 前端 `BacktestControls` 增加时间区间选择(预设区间 + 自由起止),`DataAvailability` 展示窗口内可用性

### D6: 响应契约与历史迁移

- `/backtest` 响应保持顶层标量键(`total_return/max_drawdown/win_rate/trades/bars`)以最小化前端冲击,`series`/`trade_list` 改为 vectorbt 口径字段
- `backtest_history` schema 变更:旧记录(trade_list/series 字段不同)与新渲染不兼容 → 提供一次性字段映射或标注清理,二者在实现时按数据量取舍(默认:对旧记录标记 `legacy: true`,新记录用新字段)

## Risks / Trade-offs

- [vectorbt 成交时机细节可能不同于旧"下一根生效"] → 以确定性测试锁定 from_signals 的 delay/price/freq 参数,确保无前视
- [Numba 首次 JIT 冷启动,回测后台任务首跑慢] → 服务启动时预热一次典型回测;vectorbt 支持 numba cache
- [pandas 3 / vectorbt 1.1 组合的边界行为] → 固定版本并跑满既有三层测试(L1 integrity / L2 live / L3 browser)
- [旧 7 条回测测试与历史记录作废] → 按新语义重写测试基线;历史记录标记 `legacy`
- [VEGAS/KDJ/Fib 无 vectorbt 原生实现] → 保留薄包装,确定性由既有测试守护
- [sklearn 估计器随机性] → 固定 `random_state`/`SKLEARN_SEED`,确定性测试覆盖
- [因子 IC 与回测同窗口一致性] → `/dl/features` 与 `/backtest` 共用同一窗口参数,spec 已约束

## Migration Plan

分阶段推进,每阶段可独立合并与回归:

1. **Phase 0 依赖**: 声明并安装 numpy/vectorbt/scikit-learn/quantstats,验证 py3.14 wheels;跑通现有测试基线
2. **Phase 1 指标**: `indicators.py` 内部换 vbt.Indicator(签名不变),因子 parity 测试通过
3. **Phase 2 模型**: `SklearnModel` + TimeSeriesSplit + roc_auc/log_loss,确定性测试通过
4. **Phase 3 回测**: vectorbt Portfolio 重写 `backtest()`/`_extract_trades`,响应契约更新,回测语义测试重基线,历史记录 `legacy` 标记
5. **Phase 4 数据选取**: `start/end` 贯穿 `/backtest`/`/dl/features`,周期放开,区间校验
6. **Phase 5 前端 + 回归**: 周期/区间选择器、MetricCards/SeriesChart/TradeTable 字段映射,全量三层测试回归

**回滚**: 各阶段独立提交;Phase 3 前旧引擎可用,后端保留 `dlquant_legacy.py`(仅作回滚参考,不参与运行)或依赖 git 历史回退。

## Open Questions

- `from_signals` 无前视参数的最终取值(delay/price/freq 组合)需在 Phase 3 用测试验证确定
- 旧回测历史记录走字段映射还是直接清理,取决于实际存量
- VEGAS/KDJ/Fib 包装层是否值得写成自定义 vbt.Indicator,或维持薄包装
- 参数扫描在 UI 的暴露范围(MVP 是否只透出单次回测)
