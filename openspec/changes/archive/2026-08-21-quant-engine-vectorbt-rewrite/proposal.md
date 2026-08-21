# quant-engine-vectorbt-rewrite

## Why

当前量化引擎(自实现 numpy LR + 手写向量化回测 + 自实现指标)功能可用但"成熟度不足":回测/交易记录/绩效指标均为自维护代码,walk-forward 只支持单次切分,参数扫描只能一次一组,且量化模块无法选取任意时间区间与周期。决策:接受 vectorbt 标准语义,全量引入 vectorbt(v1.x,兼容 Python 3.14 / pandas 3 / numpy 2.5)重写量化引擎与框架,并在模型层引入 scikit-learn、补齐任意区间×周期选取能力。

## What Changes

- **BREAKING**: 引入 vectorbt v1.x,以 `vbt.Portfolio` 替换手写 `backtest()` 与 `_extract_trades`,接受 vectorbt 标准成交/费用/滑点/交易记录语义;既有"信号下一根生效/翻仓双边成本/末根按市值"的自定义语义作废,相关 7 条测试重新基线化。
- **BREAKING**: 以 `vbt.Indicator` 体系替换自实现 `indicators.py`(MACD/KDJ/BOLL/VEGAS/RSI/ATR 等),`factors.py` 依赖面随之迁移,确定性要求保留并重新验证。
- 引入 scikit-learn(Scope B):`LogisticRegression`+`StandardScaler` 替换手写 `LogisticRegressionNP`,`HistGradientBoostingClassifier` 作为可选模型,`TimeSeriesSplit` 升级 walk-forward,增加 `roc_auc/log_loss` 模型评估指标;保留 `Model` Protocol 插拔接口。
- 量化模块支持任意有效时间区间 × 任意有效时间级别的蜡烛数据选取:`/backtest` 与 `/dl/features` 接受 `start/end`(ms),前端周期列表放开至全部合法级别并增加时间区间选择器。
- 使用 vectorbt `splitter.walk_forward`/`range_split` 实现多折、多区间的稳健性检验与参数扫描。
- 依赖声明:`numpy` 显式加入 `pyproject.toml`,新增 `vectorbt`、`scikit-learn`、`quantstats`。
- **BREAKING**: `/backtest` 返回结构(metrics/series/trade_list)按 vectorbt 口径调整,回测历史记录 schema 迁移(旧记录不再兼容新渲染)。

## Capabilities

### New Capabilities

- `quant-engine-vectorbt`: 以 vectorbt 全量重写的量化引擎——组合模拟(`vbt.Portfolio`)、walk-forward/多区间切分、信号工具、参数扫描、交易记录与绩效指标(含 QuantStats 集成);接受 vectorbt 标准语义。
- `quant-indicators`: 技术指标计算迁移至 vectorbt `Indicator` 体系,替代自实现 `indicators.py`,保留无前视与确定性要求。
- `quant-model-training`: scikit-learn 模型层——LR+StandardScaler、HistGradientBoosting、TimeSeriesSplit 交叉验证与 roc_auc/log_loss 评估,确定性由 `random_state`/`SKLEARN_SEED` 保证。
- `quant-data-selection`: 量化模块任意有效时间区间 × 任意有效时间级别蜡烛数据选取,贯穿 `/backtest`、`/dl/features` 与前端周期/区间选择器。

### Modified Capabilities

- `backtest-engine`: 回测语义变更为 vectorbt 标准(成交时机、费用/滑点模型、trade/equity/drawdown 口径),原无前视/翻仓成本语义作废。
- `technical-indicators`: 指标来源由自实现改为 vectorbt `Indicator`,确定性/无前视要求保持。
- `ml-model`: 模型实现迁移至 scikit-learn 估计器,确定性通过固定随机种子保证。
- `walk-forward-training`: 由单次 `time_split` 升级为 `TimeSeriesSplit` 多折 walk-forward(兼容单一 `train_ratio`)。
- `feature-engineering`: 特征管线适配 sklearn Pipeline,标签构造保留手写无前视逻辑。

## Impact

- **后端**: `backend/src/market_data/dlquant.py`(重写)、`indicators.py`(重写为 vbt.Indicator)、`factors.py`(适配)、`webapi.py`(`/backtest`/`/dl/features` 增加 `start/end` 与返回结构变更)、`backtest_history.py`(schema 迁移)、`pyproject.toml`(numpy/vectorbt/scikit-learn/quantstats)。
- **前端**: `DlQuantTab.tsx`、`BacktestControls.tsx`(区间选择 + 周期放开)、`MetricCards.tsx`、`SeriesChart.tsx`、`TradeTable.tsx`(字段映射)、`DataAvailability.tsx`、`api/types.ts`。
- **测试**: `test_dlquant.py`(回测语义重基线)、`test_factors.py`、`test_webapi.py`、`test_live_api.py`、`test_backtest_history.py` 相关断言更新。
- **依赖风险**: vectorbt 引入 Numba(首次 JIT 冷启动);scikit-learn 引入 scipy/joblib/narwhals;均需在 Python 3.14.6 环境验证 wheel 安装。
- **历史数据**: 旧回测历史记录与新版 schema 不兼容,需迁移或清理。
