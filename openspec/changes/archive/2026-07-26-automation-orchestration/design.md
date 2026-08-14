## Context

组件齐备:`ParquetStore`(#1)、`indicators/levels`(#2)、`risk`(#3)、`execution`(#4)、`agent/llm`(#5)、`memory`(#6)、`dlquant`(#7)、`scheduler`(#1 的 APScheduler 骨架)。#6 归档时记录 WARNING:记忆组件就绪但未接入 Agent 运行时。本 change 在**编排层**组合这些能力(不改已归档模块),闭合记忆回路并做定时编排。

## Goals / Non-Goals

**Goals:**
- 单次 Agent 循环闭合记忆-反思回路(检索→增强→决策→执行→落库→反思)。
- 全局 kill-switch + 默认纸面守卫。
- kill-switch 感知的定时编排任务(拉数据/Agent循环/DL重训)。
- 可注入组件,离线端到端可测。

**Non-Goals:**
- 不改已归档模块既有行为(在编排层组合)。
- 不做实盘直连 DL 执行(仍纸面为主)。
- 不做前端(#9)。
- 不做分布式/持久化调度(进程内 APScheduler 足够)。

## Decisions

### D1:记忆增强决策(闭合 #6,不改 #5)
编排层组装增强上下文,而非修改已归档的 `TradingAgent`:
`build_agent_context(#5) → features_from_context(#6) → MemoryStore.retrieve → distill_rules → augment_context → provider.propose(augmented)`。
provider 复用 #5 的 `RuleBasedProvider`/`LLMTextProvider`。

### D2:`AgentCycle`
- 构造注入:`provider, engine(#4), memory_store(#6), reflector(#6), journal(#6), run_control, cfg`。
- `step(df, symbol, timeframe, price, news=None) -> dict`:
  1. `run_control.can_trade()` 否则返回 halted。
  2. 增强决策(D1)。
  3. 若 `open` 且无持仓 → `engine.place`(过 #3/#4 风控);记录开仓元信息(entry/side/features/reason)。
  4. 若 `close` 且有持仓 → `close_position`。
  5. 否则 hold。
- `close_position(symbol, price, reason)`:`engine.close` 得 pnl → 组装 `TradeRecord`(entry 来自开仓元信息 + exit + pnl + features)→ `Reflector.reflect` 写反思 → `journal.append`。
- `enforce(price)`:熔断触发时平掉相关持仓并各自落库反思。

### D3:`RunControl`
`dataclass(paper_only=True, kill_switch=False, enabled=True)`;`can_trade()=enabled and not kill_switch`。自动化运行前校验;实盘另受 #4 双闸门约束。

### D4:编排任务(复用 APScheduler)
`build_orchestrator(cycle, data_pull, retrain, settings, run_control) -> BackgroundScheduler`,注册:
- `data_pull`(复用 #1 `run_incremental_pull`)。
- `agent_cycle`(对配置的 symbols/timeframe 逐个 `step`)。
- `retrain`(复用 #7 `run_pipeline` 产出回测指标,记录日志)。
每个 job 首先检查 `run_control`;kill-switch 打开则跳过交易类 job。

### D5:CLI
`orchestrate --once`:读存储 → 跑一次 `AgentCycle.step`(纸面)→ 打印决策、是否成交、记忆命中数。

## Risks / Trade-offs

- **循环状态(开仓元信息)在内存** → 进程重启丢失;后续可持久化(接口预留),本 change 内存足够验证闭环。
- **编排层组合而非改模块** → 略有重复(重建增强上下文),但保持已归档模块稳定、边界清晰。
- **定时并发** → APScheduler `max_instances=1, coalesce=True`(沿用 #1)。
- **kill-switch 仅进程内** → 简单可靠;分布式留待后续。

## Open Questions

- Agent 循环触发频率(日线收盘/定时)与 DL 重训周期默认值——给经验值,可配。
- 开仓元信息持久化(接 #6 journal 的未平仓表)——后续增强,接口预留。
- 实盘编排的额外确认/限频——接实盘时补(复用 #4 双闸门)。
