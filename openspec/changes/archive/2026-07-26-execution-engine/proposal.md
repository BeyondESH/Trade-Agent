## Why

前三个 change 提供了数据、指标/S/R 与风控闸门。本 change 是**首个能真正下单**的层,但默认纸面、绝不擅自碰钱。它统一开/平仓接口,并把 #3 风控作为**强制前置闸门**:任何订单在执行前必须通过风控校验与熔断检查。AI Agent(#5)与 DL(#7)都经此层下单。

## What Changes

- 新增**统一执行接口**:`place`(开/加仓)、`close`(平仓),返回可解释的执行结果。
- 新增**风控强制闸门**:执行前必过 `RiskEngine.check_order` 与 `check_circuit_breaker`;未通过则拒绝,绝不下单。
- 新增**纸面撮合**(PaperBroker):按成交价模拟开/平仓,维护组合状态与 PnL、加仓计数、权益峰值。
- 新增**实盘适配**(LiveBroker,走 `bitget-agent-mcp` 的 `order` 工具):**默认关闭**,需显式开启实盘 + 二次确认方可执行;否则拒绝。
- 新增**熔断执行**:达回撤阈值时阻断新单并给出平仓建议。
- 纯逻辑 + 可注入的 MCP 客户端,纸面路径完全离线可测;实盘路径用假客户端验证参数与安全门,不触真实资金。

## Capabilities

### New Capabilities
- `execution-core`: 统一 place/close + 风控前置闸门 + 执行结果。
- `paper-broker`: 纸面撮合、组合与 PnL 维护。
- `live-safety`: 默认纸面;实盘需显式开启 + 二次确认;实盘经 MCP `order`。
- `circuit-breaker-enforcement`: 熔断时阻断下单并建议平仓。

### Modified Capabilities
<!-- 无 -->

## Impact

- **依赖**:复用 `risk.py`、`mcp_client.py`(实盘路径),无新增。
- **代码**:`backend/src/market_data/execution.py`;CLI 增加 `trade`(纸面演示)子命令。
- **对齐路线图**:实现 #4;不实现策略/LLM(#5)、不实现 DL 直连执行(#7 再补)。
- **安全**:默认纸面;实盘双重闸门(开启标志 + 确认);凭据仅环境变量。
