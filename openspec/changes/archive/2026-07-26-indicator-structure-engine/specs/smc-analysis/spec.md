## ADDED Requirements

### Requirement: 流动性位识别

系统 SHALL 识别流动性位:近期 swing 高/低,以及容差内聚簇的等高/等低位(equal highs/lows)。

#### Scenario: 输出流动性位

- **WHEN** 传入 OHLCV 帧
- **THEN** 系统 SHALL 返回流动性位列表(价格与类型:高侧/低侧)

### Requirement: 订单块识别

系统 SHALL 识别订单块(order block):结构突破前最后一根反向 K 线的价格区间(看涨/看跌 OB)。

#### Scenario: 识别 OB

- **WHEN** 出现向上结构突破
- **THEN** 系统 SHALL 将突破前最后一根阴线区间标记为看涨订单块

### Requirement: 结构突破判定 BOS/CHOCH

系统 SHALL 基于 swing 序列判定 Break of Structure(BOS)与 Change of Character(CHOCH)。

#### Scenario: 判定 BOS

- **WHEN** 价格突破上一个同向 swing 极值
- **THEN** 系统 SHALL 标记一次 BOS 及其方向

#### Scenario: 判定 CHOCH

- **WHEN** 结构方向发生反转(突破反向 swing 极值)
- **THEN** 系统 SHALL 标记一次 CHOCH 及其方向
