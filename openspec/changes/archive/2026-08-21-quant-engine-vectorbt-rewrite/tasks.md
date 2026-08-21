# quant-engine-vectorbt-rewrite — Tasks

## 1. 依赖与基线

- [x] 1.1 在 `backend/pyproject.toml` 显式声明并安装 `numpy`、`vectorbt>=1.1`、`scikit-learn>=1.9`、`quantstats`,锁定版本
- [x] 1.2 在 py3.14.6 venv 验证全部新依赖 wheel 安装成功(含 numba/scipy),记录版本
- [x] 1.3 运行既有测试基线(`cd backend && python -m pytest -q`)确认迁移前全绿

## 2. 指标层迁移(quant-indicators / technical-indicators)

- [x] 2.1 将 `indicators.py` 内部实现改为 vectorbt Indicator(RSI/ATR/BBANDS/MACD/STOCH),保持对外函数签名不变
- [x] 2.2 为 vectorbt 无原生实现的 VEGAS 通道、KDJ-J、斐波那契回撤保留薄包装(ewm/rolling),确定性不变
- [x] 2.3 校验 `compute(df)` 输出列名与迁移前一致(dif/dea/macd_hist、kdj_k/d/j、boll_mid/upper/lower、vegas_ema*)
- [x] 2.4 运行 `test_factors.py` 与因子 parity 测试,确认默认 7 因子列名/结构不变(数值按 vectorbt 标准口径),白名单 DSL 行为一致
- [x] 2.5 补充"数据不足返回 NaN、无前视、确定性"用例并跑绿

## 3. 模型层迁移(quant-model-training / ml-model)

- [x] 3.1 实现 `SklearnModel` 适配器,内部为 `Pipeline(StandardScaler + estimator)`,实现 `fit`/`predict_proba`,默认 `LogisticRegression`
- [x] 3.2 支持 `HistGradientBoostingClassifier` 作为可选模型,可通过参数选择
- [x] 3.3 固定 `random_state`(或 `SKLEARN_SEED`),满足确定性 spec;重写/新增确定性测试
- [x] 3.4 用 `TimeSeriesSplit` 实现多折 walk-forward,兼容单一 `train_ratio`;更新 `walk-forward-training` 相关测试
- [x] 3.5 在 `train_predict` 输出测试集 `roc_auc` 与 `log_loss`
- [x] 3.6 更新 `ml-model`/`walk-forward-training` 迁移后的行为测试并跑绿

## 4. 回测引擎重写(quant-engine-vectorbt / backtest-engine)

- [x] 4.1 用 `vbt.Portfolio.from_signals` 重写 `backtest()`,信号映射自 `signals_from_proba`,`freq` 由 timeframe 推导
- [x] 4.2 用确定性测试锁定无前视成交参数(delay/price/freq),确保信号第 t 根、成交不早于 t+1 根
- [x] 4.3 用 `pf.stats()`/`pf.drawdown`/`pf.trades` 替换手写 equity/drawdown/trade_list 提取
- [x] 4.4 重写 `test_dlquant.py` 的 7 条回测语义测试为 vectorbt 标准语义基线(指标/曲线/空交易/确定性)
- [x] 4.5 接入 `vbt.splitter.walk_forward`/`range_split` 支持多折、多区间回测;实现参数扫描(threshold/fee/slippage 网格)
- [x] 4.6 接入 vectorbt returns 指标与 `qs_adapter`(QuantStats),提供 Sharpe/Sortino/Calmar/profit_factor 摘要
- [x] 4.7 更新 `/backtest` 响应契约:保持顶层标量键,`series`/`trade_list` 按 vectorbt 口径映射
- [x] 4.8 更新 `backtest_history` schema:新记录用新字段,旧记录标记 `legacy: true` 且不参与新渲染

## 5. 数据窗口与周期选取(quant-data-selection)

- [x] 5.1 `BacktestBody`/`FeaturesBody` 增加可选 `start`/`end`(UTC ms),`_read` 透传 `store.read` 窗口
- [x] 5.2 实现区间校验:`start < end` 且与数据有交集,否则返回明确错误;缺省时全量保持兼容
- [x] 5.3 `/dl/features` 与 `/backtest` 使用同一窗口,结果 `data_meta` 反映实际窗口
- [x] 5.4 周期合法性统一为 `models.py` 的 14 个有效级别(排除 `1s`),后端拒绝非法周期

## 6. 前端与回归

- [x] 6.1 `BacktestControls` 周期列表放开至全部有效级别,增加时间区间选择(预设 + 自由起止),默认 1h
- [x] 6.2 `DlQuantTab` 将所选 `start`/`end` 传入回测与因子 IC 请求
- [x] 6.3 `MetricCards`/`SeriesChart`/`TradeTable` 字段映射适配 vectorbt 口径;`DataAvailability` 展示窗口内可用性
- [x] 6.4 更新 `api/types.ts` 与前端相关测试
- [x] 6.5 更新 `test_webapi.py`/`test_live_api.py`/`test_backtest_history.py` 中 `/backtest`、`/dl/features` 断言
- [x] 6.6 服务启动时预热一次典型回测(缓解 Numba JIT 冷启动)
- [x] 6.7 全量回归:L1(`pytest -m integrity`)、L2(live API/WS)、L3(`npm run test:e2e`)+ 前端 typecheck 全绿
