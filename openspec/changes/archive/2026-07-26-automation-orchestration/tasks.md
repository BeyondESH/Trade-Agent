## 1. 运行控制

- [x] 1.1 `orchestration.py`:`RunControl(paper_only=True, kill_switch=False, enabled=True)` + `can_trade()`

## 2. Agent 交易循环(闭合 #6)

- [x] 2.1 记忆增强决策:build_agent_context → features_from_context → retrieve → distill_rules → augment_context → provider.propose
- [x] 2.2 `AgentCycle.step`:can_trade 守卫;open 无持仓→engine.place;记录开仓元信息
- [x] 2.3 `close_position`:engine.close→组装 TradeRecord(entry/exit/pnl/features)→reflect→journal.append
- [x] 2.4 `enforce(price)`:熔断→平相关持仓并各自落库反思

## 3. 编排任务

- [x] 3.1 `build_orchestrator`:注册 data_pull / agent_cycle / retrain 三类任务
- [x] 3.2 各 job 先查 kill-switch;交易类跳过;失败隔离(记录日志不中断)

## 4. CLI

- [x] 4.1 `orchestrate --once`:读存储→跑一次 step(纸面)→打印决策/成交/记忆命中

## 5. 测试

- [x] 5.1 记忆闭环:step 开仓 → close_position 落库+反思 → retrieve 命中该交易
- [x] 5.2 记忆注入:增强上下文含 memories/rules
- [x] 5.3 RunControl:kill-switch→can_trade False;step 停机不下单;默认 paper_only
- [x] 5.4 开仓经风控:step 开仓过风控闸门;风控拒绝不建仓
- [x] 5.5 编排:build_orchestrator 注册三类 job(job id 存在);kill-switch 时 agent job 不下单
- [x] 5.6 重训 job 调 run_pipeline 返回指标不崩
- [x] 5.7 用 #1 真实数据跑 `orchestrate --once` 端到端
