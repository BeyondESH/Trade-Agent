## Why

路线图 #7:实现深度学习/机器学习量化模式(5 分钟级,合约)。数据→特征→模型→信号→回测的研究闭环,是与 AI Agent(#5)并列的第二个「交易大脑」。它数据驱动、可回测、低延迟,消费 #1 的已存 K 线,复用 #2 的指标做特征,并可经 #3/#4 风控执行(实盘直连留待后续)。

## What Changes

- 新增**特征工程**:从 5m OHLCV 构造特征(收益率、指标衍生:MACD/KDJ/布林位置/VEGAS 距离、滚动统计)与标签(下一根方向),**无前视偏差**(标签前移、特征只用当前及过去)。
- 新增**可插拔模型接口** + **numpy 自研 baseline**(标准化 + 逻辑回归梯度下降),确定性、零重型依赖。
- 新增**时序训练/预测**:按时间切分 train/test(walk-forward 思路),无数据泄漏。
- 新增**向量化回测**:按信号做多/空,计入**手续费 + 滑点**,产出指标(总收益、胜率、最大回撤、交易数、收益/风险)。信号在 t 生成、t+1 执行,无前视。
- CLI `backtest`:读存储 5m 数据 → 特征 → 训练/测试 → 回测 → 打印指标。

### 关于深度学习框架
PyTorch/TF 在 Python 3.14 可能暂无 wheel。故本 change 以 **numpy 算法 baseline** 落地并暴露 `Model` 接口;待框架就绪(或降级 Python),可无缝接入 sklearn/torch 模型(文档化为 hook,同 LLM/实盘路径策略)。

## Capabilities

### New Capabilities
- `feature-engineering`: 从 OHLCV 构造无前视的特征与标签。
- `ml-model`: 可插拔模型接口 + numpy 逻辑回归 baseline。
- `walk-forward-training`: 时序切分训练/预测,无泄漏。
- `backtest-engine`: 计费用/滑点的向量化回测与指标。

### Modified Capabilities
<!-- 无 -->

## Impact

- **依赖**:仅 numpy/pandas(已有);不引入 torch/sklearn(py3.14 wheel 不确定),接口预留。
- **代码**:`backend/src/market_data/dlquant.py`;CLI 增加 `backtest`。
- **对齐路线图**:实现 #7 研究/回测闭环;DL 实盘直连执行、定时训练留待 #8;前端 #9。
- **安全**:回测计费用/滑点、无前视;不自动实盘。
