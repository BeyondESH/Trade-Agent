## 1. 技术指标引擎

- [x] 1.1 `indicators.py`:EMA 工具 + MACD(dif/dea/hist)
- [x] 1.2 KDJ(k/d/j)与布林带(mid/upper/lower)
- [x] 1.3 VEGAS 通道(EMA144/169/576/676)
- [x] 1.4 斐波那契回撤位(基于最近 swing 高低)
- [x] 1.5 数据不足时返回 NaN/空,不抛错

## 2. 市场结构引擎

- [x] 2.1 `structure.py`:分形法 swing 高/低(窗口可配)
- [x] 2.2 上/下趋势线线性拟合(斜率/截距/当前投影)
- [x] 2.3 箱体识别(区间宽度 + 触碰次数阈值),无箱体返回空

## 3. SMC 分析

- [x] 3.1 `smc.py`:流动性位(swing 高低 + 等高/等低聚簇)
- [x] 3.2 订单块(突破前最后反向 K 区间)
- [x] 3.3 BOS/CHOCH 判定

## 4. 支撑/压力聚合

- [x] 4.1 `levels.py`:统一 Level 模型(price/kind/sources/strength)
- [x] 4.2 各来源价位汇集 + 容差聚簇合并 + 强度计算
- [x] 4.3 按强度降序、去重输出

## 5. CLI 与集成

- [x] 5.1 CLI `analyze` 子命令:从 Store 读数 → 指标末值 + Top-N S/R
- [x] 5.2 计算前最小长度校验(无前视偏差)

## 6. 测试

- [x] 6.1 指标对拍:构造已知序列验证 MACD/KDJ/BOLL/EMA 数值
- [x] 6.2 结构:构造带明显 swing/箱体的序列验证识别
- [x] 6.3 SMC:构造突破序列验证 OB 与 BOS/CHOCH
- [x] 6.4 聚合:多来源相近位合并、强度与排序正确
- [x] 6.5 用 #1 已存的真实 BTCUSDT 数据跑 `analyze` 端到端
