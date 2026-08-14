## ADDED Requirements

### Requirement: 确定性 S/R 与指标输入

AI Agent 的支撑/压力位与技术态势 MUST 由确定性算法/开源框架产出(Fibonacci 回撤、MACD、KDJ、布林带、VEGAS 通道、SMC 流动性/订单块,以及自动趋势线与箱体标注),再作为输入提供给 LLM。LLM MUST NOT 仅凭目测价格臆造 S/R 位。

#### Scenario: 指标与结构先行计算

- **WHEN** AI Agent 准备做出决策
- **THEN** 系统 SHALL 先计算指标与自动标注趋势线/箱体/S/R 候选位
- **AND** 将结果作为结构化输入传给 LLM

### Requirement: 新闻与宏观面结合

AI Agent SHALL 通过 `bitget-signal` 获取新闻/宏观/情绪分析,并与技术面结合形成决策。

#### Scenario: 融合基本面

- **WHEN** AI Agent 生成开/平仓建议
- **THEN** 决策输入 SHALL 同时包含技术指标结构与新闻/宏观信号

### Requirement: 左侧交易决策输出契约

AI Agent 以左侧交易(在支撑处低吸、压力处高抛)为主策略,SHALL 输出结构化的开/平仓建议,包含方向、标的、参考价位、理由,并交由风控执行层校验后执行。

#### Scenario: 决策经风控校验

- **WHEN** AI Agent 产出开/平仓建议
- **THEN** 建议 SHALL 先经风控-仓位模型校验
- **AND** 仅在通过校验后执行(默认纸面)

### Requirement: 记忆-反思迭代系统

系统 SHALL 记录每笔交易(策略、盈亏、开平仓数额/价格/杠杆),并实现三种反思反哺:(a) RAG 检索历史交易注入决策、(b) 策略参数自调、(c) 经验规则库沉淀。

#### Scenario: 记录并可检索

- **WHEN** 一笔交易平仓
- **THEN** 系统 SHALL 记录交易明细与反思文本
- **AND** 该记录可被后续决策的 RAG 检索命中

#### Scenario: 反思反哺决策

- **WHEN** AI Agent 面对与历史相似的行情情形
- **THEN** 系统 SHALL 将相似历史交易与反思注入决策上下文
