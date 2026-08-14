## Why

前七个 change 提供了全部组件,但仍是「零件」。本 change 把它们编排成**无人值守系统**:定时拉数据(#1)→ 计算指标/S/R(#2)→(DL 定时训练/回测 #7)→ Agent 决策(#5)→ 风控执行(#4,默认纸面)→ **记忆-反思闭环(#6)**。同时补上 #6 归档时记的 WARNING:把记忆回路真正接入 Agent 运行时(检索→增强→决策、平仓→落库→反思)。

## What Changes

- 新增**Agent 交易循环**(闭合记忆回路):一次循环内 `build_agent_context(#5) → features_from_context+retrieve+augment_context(#6) → provider 决策 → 风控执行(#4) → 平仓落交易日志 + 生成反思(#6)`。
- 新增**运行控制**:全局 kill-switch + 默认纸面守卫;自动化运行前校验,禁用/熔断时不下单。
- 新增**编排定时任务**:复用 APScheduler(#1 骨架),注册「增量拉数据」「Agent 循环」「DL 重训/回测」三类周期任务,**均受 kill-switch 约束**。
- CLI `orchestrate --once`:在已存数据上跑一次 Agent 循环(纸面)并打印,直观展示记忆闭环。
- 纯编排 + 可注入组件;用规则 provider + 纸面 broker + 内存日志即可离线端到端测试(无需真实 MCP/LLM)。

## Capabilities

### New Capabilities
- `agent-cycle`: 单次完整 Agent 交易循环,闭合记忆-反思回路。
- `run-control`: 全局 kill-switch 与默认纸面守卫。
- `orchestration-jobs`: kill-switch 感知的编排定时任务(拉数据/Agent循环/DL重训)。

### Modified Capabilities
<!-- 无(在编排层组合既有能力,不改已归档模块的既有行为) -->

## Impact

- **依赖**:复用 `store/agent/llm/memory/execution/risk/dlquant/scheduler`,APScheduler(已有),无新增。
- **代码**:`backend/src/market_data/orchestration.py`;CLI 增加 `orchestrate`。
- **对齐路线图**:实现 #8 并闭合 #6 回路;前端 #9 留待最后。
- **安全**:默认纸面;kill-switch 一键停;编排不绕过 #3/#4 风控闸门。
