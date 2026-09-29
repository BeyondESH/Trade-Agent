# execution-graph Specification

## Purpose

Tier 2 执行与硬风控：一张零 LLM 的确定性 LangGraph 状态图，接管下单执行与硬风控。fail-closed。

## ADDED Requirements

### Requirement: 确定性执行图

系统 SHALL 用 LangGraph `StateGraph` 构建执行图；其节点 MUST 只做纯计算与 I/O，MUST NOT 包含任何 LLM 节点或 LLM 调用。

#### Scenario: 无 LLM 边界

- **WHEN** 静态检查执行图与 broker 模块
- **THEN** MUST NOT 存在 `deepagents` / `create_agent` / LLM provider 的 import 或调用

### Requirement: 执行前置校验

执行图 SHALL 依次执行契约 schema 校验、TTL 校验与市场可交易校验（symbol 可交易、行情新鲜）；任一失败 SHALL 走 `fail_closed`。

#### Scenario: 过期或不可交易

- **WHEN** 提案已过期或 symbol 不可交易
- **THEN** SHALL `fail_closed` 且不下单

### Requirement: 硬风控闸门

执行图 SHALL 施加可配置硬风控：最大杠杆、单标的名义敞口上限、组合敞口上限、最大回撤熔断与 kill-switch；任一越界 SHALL `fail_closed`。

#### Scenario: 越界拒绝

- **WHEN** 计算的敞口或杠杆超过配置上限
- **THEN** SHALL `fail_closed`，且 MUST NOT 缩小后强行下单（除非显式配置）

### Requirement: 确定性定量 sizing

仓位 SHALL 由确定性 sizing 计算（基于账户权益与风险比例）；MUST NOT 采用提案中的仓位或杠杆数值。

#### Scenario: 忽略 LLM 仓位

- **WHEN** 提案携带任意仓位建议
- **THEN** 实际下单量 SHALL 仅由确定性 sizing 决定

### Requirement: fail-closed 与审计

任一节点失败 SHALL 终止为 `fail_closed` 并写入审计事件；成功路径 SHALL 每步写审计。

#### Scenario: 全链路可审计

- **WHEN** 回放一次执行 run
- **THEN** SHALL 可依审计事件重建每个节点的输入与决策

### Requirement: 幂等提交

提交节点 SHALL 使用幂等键；对同一 `thread_id` 的恢复 MUST NOT 造成重复下单。

#### Scenario: 恢复不重复

- **WHEN** 在失败后恢复同一执行 run
- **THEN** SHALL NOT 重复产生成交
