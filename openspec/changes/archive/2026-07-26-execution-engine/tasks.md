## 1. 接口与模型

- [x] 1.1 `execution.py`:`OrderRequest`(category/symbol/side/intended_leverage/price)
- [x] 1.2 `ExecutionResult`(approved/filled/reason/decision/position)

## 2. 纸面撮合

- [x] 2.1 `PaperBroker.open`:按成交价建/加仓,更新保证金/敞口/入场价/加仓计数
- [x] 2.2 `PaperBroker.close`:按方向算 PnL,更新权益与峰值,移除持仓

## 3. 实盘适配与安全

- [x] 3.1 `LiveBroker`:构造需 client+category;执行前要求 live_enabled + confirm
- [x] 3.2 未开启/未确认时拒绝且不调用 MCP
- [x] 3.3 下单经 MCP `order` place(long→buy,short→sell,size=敞口/价)

## 4. 执行引擎(风控闸门)

- [x] 4.1 `ExecutionEngine.place`:熔断检查 → 风控校验 → broker 执行
- [x] 4.2 未通过任一检查则返回未成交且不下单
- [x] 4.3 `close` 走 broker;默认 PaperBroker
- [x] 4.4 `enforce_circuit_breaker`:返回应平仓持仓集合

## 5. CLI

- [x] 5.1 `trade`(纸面):place 一次 → 打印决策/仓位 → close → 打印 PnL

## 6. 测试

- [x] 6.1 纸面开仓:通过风控后组合记录持仓、加仓计数+1
- [x] 6.2 纸面平仓:多头盈利/亏损 PnL 正负正确、权益更新
- [x] 6.3 风控拒绝(无额度/加仓超限)→ 未成交且未调用 broker
- [x] 6.4 熔断:回撤达阈值时 place 被阻断;enforce 返回应平仓集合
- [x] 6.5 实盘安全:未开启/未确认时拒绝且不调用假 MCP;确认后用假客户端断言下单参数(buy/sell、size)
