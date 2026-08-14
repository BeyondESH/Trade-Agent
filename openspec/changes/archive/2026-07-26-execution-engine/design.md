## Context

`risk.py`(#3)提供 `RiskConfig/Portfolio/RiskEngine/size_position`。`mcp_client.py`(#1)可调用 MCP,`order` verb 的 action 含 `place/cancel/...`(已由 discover 确认)。路线图 design:AI Agent 走 MCP、DL 走直连;默认纸面、实盘显式开启 + 二次确认。本 change 落地统一执行层,把风控作为硬闸门,DL 直连执行留待 #7。

## Goals / Non-Goals

**Goals:**
- 统一 place/close 接口,返回可解释结果。
- 执行前强制过风控校验 + 熔断检查。
- 完整纸面撮合(组合/PnL/加仓/峰值),离线可测。
- 实盘适配走 MCP `order`,默认关闭,需显式开启 + 确认。

**Non-Goals:**
- 不做策略/信号/LLM(#5)。
- 不做 DL 直连 REST/WS 执行(#7)。
- 不做实盘杠杆/账户模式设置的完整编排(仅下单调用;账户配置留待接线时补)。
- 不做前端(#9)。

## Decisions

### D1:统一接口与结果
- `OrderRequest(category, symbol, side, intended_leverage, price=None)`;side ∈ {long, short}。
- `ExecutionResult(approved, filled, reason, decision, position)`。
- `ExecutionEngine.place(order, price)`、`close(symbol, price)`。

### D2:风控强制前置闸门(顺序)
`place` 内部顺序:
1. `check_circuit_breaker(portfolio)` → 若触发,拒绝并建议平仓(不下单)。
2. `check_order(portfolio, symbol, intended_leverage)` → 未通过则拒绝;通过得 margin/notional/leverage。
3. 交由 broker 执行。
**任何订单不经此闸门不得下单。**

### D3:纸面撮合 `PaperBroker`
- `open`:按成交价建/加仓,`margin += decision.margin`,`notional = margin*leverage`,`adds += 1`,记录 entry。
- `close`:按方向计算 PnL = notional·(exit−entry)/entry·dir,`equity += pnl`,移除仓位,更新 `peak_equity`。
- 纯内存、确定性。

### D4:实盘安全 `LiveBroker`
- 构造需 `client`(MCP)、`category`;执行前要求 `live_enabled=True` 且 `confirm()` 返回真,否则抛/拒绝。
- 下单:`client.call_tool("order", {action:"place", category, symbol, side:buy/sell, orderType:"market", size: notional/price, ...})`。
- side 映射:long→buy、short→sell。size = 名义敞口/价格(数量)。
- **默认不启用**;`ExecutionEngine` 默认用 PaperBroker。

### D5:熔断执行
`place` 首步即熔断检查;另提供 `enforce_circuit_breaker()` 供定时/事件触发:达阈值返回应平仓的持仓列表。

### D6:CLI
`trade`(纸面):给定 equity/symbol/side/leverage/price 演示一次 place,打印决策与仓位;再 close 打印 PnL。

## Risks / Trade-offs

- **纸面撮合简化**(无滑点/手续费/部分成交) → 标注;#7/#5 可加入费用滑点模型;不影响风控闸门验证。
- **实盘误触发** → 双闸门(live_enabled + confirm)+ 默认纸面 + 凭据仅环境变量;测试用假客户端不触真实资金。
- **实盘杠杆未设置** → 本 change 仅下单;实盘接线时需先 `account_config setLeverage`(记为接线注意项)。

## Open Questions

- 实盘 `order.place` 的精确必填参数(size 单位/精度、是否需 marginCoin)——真正接实盘前用 discover + demo key 确认(与 #1 同法)。
- 平仓是否走 `position.close` 而非反向 `order`——接线时确认;本 change 抽象为 broker.close。
