## 1. 特征工程

- [x] 1.1 `dlquant.py`:`build_features(df)` → (X, y),复用 indicators 衍生特征
- [x] 1.2 标签 = 下一根方向;丢弃末行;dropna 暖机期;无前视

## 2. 模型

- [x] 2.1 `Model` 协议(fit/predict_proba)
- [x] 2.2 `LogisticRegressionNP`:train 标准化 + 梯度下降(确定性),sigmoid 概率

## 3. 时序切分

- [x] 3.1 `time_split(n, train_ratio)`:train 全早于 test
- [x] 3.2 `train_predict`:标准化仅用 train,输出 test 概率

## 4. 回测

- [x] 4.1 `signals_from_proba(proba, thresh)` → {-1,0,1}
- [x] 4.2 `backtest(df, signals, fee, slippage)`:position=shift(1),计费用/滑点
- [x] 4.3 指标:总收益、最大回撤、胜率、交易数、收益/回撤比

## 5. 管道与 CLI

- [x] 5.1 `Pipeline`:features→split→train→signals→backtest
- [x] 5.2 CLI `backtest --symbol --timeframe`:打印指标

## 6. 测试

- [x] 6.1 特征/标签:长度一致、无 NaN、标签由 close[t+1] 决定(无前视)
- [x] 6.2 模型:玩具可分数据准确率高;proba∈[0,1];两次训练一致
- [x] 6.3 切分:train 索引 < test 索引;标准化只用 train
- [x] 6.4 回测:信号 t+1 生效;提高费用收益不增;指标齐全
- [x] 6.5 构造已知趋势+信号→回测 PnL 符号符合预期
- [x] 6.6 用 #1 真实 5m 数据跑 `backtest` 端到端
