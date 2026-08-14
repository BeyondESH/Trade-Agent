## Context

#1 提供 5m 存储,#2 提供指标,#3/#4 提供风控执行。路线图 design D2/D7:DL 走 5m、可回测、低延迟;开源框架或算法实现。现实约束:PyTorch/TF 在 Python 3.14 多半无 wheel。故本 change 采用 numpy 自研 baseline + 可插拔模型接口(与项目「自研以求稳健」一致),保证 py3.14 可跑、离线可测,框架后续可插。

## Goals / Non-Goals

**Goals:**
- 无前视的特征/标签工程。
- 可插拔 `Model` 接口 + numpy 逻辑回归 baseline(确定性)。
- 时序切分训练/预测(无泄漏)。
- 计费用/滑点的向量化回测 + 指标。
- 研究/回测闭环,离线可测。

**Non-Goals:**
- 不引入 torch/sklearn(接口预留,后续可插)。
- 不做 DL 实盘直连执行与定时训练(#8)。
- 不做前端(#9)。
- 不追求 SOTA 模型,提供可解释 baseline。

## Decisions

### D1:特征与标签(无前视)
- 特征:对数收益、`indicators.compute` 的 macd_hist、kdj_j、(close−boll_mid)/std 位置、(close−vegas144)/close 距离、滚动均值/波动。仅用当前及过去 bar。
- 标签:`y[t] = 1 if close[t+1] > close[t] else 0`(下一根方向);构造后**丢弃最后一行**(无未来)。
- `build_features(df) -> (X: DataFrame, y: Series, index)`;dropna 掉暖机期。

### D2:可插拔模型 + numpy baseline
- `Model` 协议:`fit(X, y)`、`predict_proba(X) -> np.ndarray`。
- `LogisticRegressionNP`:训练前用**训练集**均值/方差标准化(存下用于测试),梯度下降(固定 lr/迭代、零初始化)→ 确定性;`predict_proba` sigmoid。
- 框架模型(sklearn/torch)后续实现同接口即可插入。

### D3:时序切分(walk-forward 思路)
- `time_split(n, train_ratio=0.7) -> (train_idx, test_idx)`,train 全在 test 之前;严禁用未来数据拟合。
- 标准化参数只从 train 估计,应用到 test。

### D4:向量化回测(计费用/滑点,无前视)
- 输入:价格序列 + 每 bar 信号 `sig ∈ {-1,0,1}`(t 时刻生成)。
- 执行:`position = sig.shift(1)`(t+1 生效,无前视);bar 收益 `ret = position * pct_change(close)`;每次仓位变化扣 `fee + slippage`。
- 指标:总收益、年化近似、胜率、最大回撤、交易次数、收益/回撤比。
- `backtest(df, signals, fee=0.0004, slippage=0.0005) -> dict`。

### D5:接口/CLI
- `dlquant.py`:`build_features`、`LogisticRegressionNP`、`time_split`、`train_predict`、`signals_from_proba`、`backtest`、`Pipeline`。
- CLI `backtest --symbol --timeframe`:读存储 → 特征 → 切分训练/预测 → 生成信号 → 回测 → 打印指标。

## Risks / Trade-offs

- **baseline 预测力有限** → 目标是打通闭环与防前视,而非盈利;接口可插更强模型。
- **过拟合/泄漏** → 时序切分 + 标准化只用 train + 标签前移;后续可加 walk-forward 多折。
- **回测乐观**(无冲击成本/部分成交) → 计固定费用+滑点,标注为近似。
- **样本量**(#1 现存 571 根 5m)偏小 → 先跑通;真实训练需按 #1 拉数年数据。

## Open Questions

- 特征集与标签跨度(下一根 vs 下 N 根/阈值过滤)默认值,需回测校准。
- 何时接入真实框架(sklearn/torch)——取决于 py3.14 wheel 或降级运行时;接口已就绪。
- DL 信号接 #4 执行的实盘路径与定时训练——归 #8。
