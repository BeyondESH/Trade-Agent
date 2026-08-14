# support-resistance Specification

## Purpose
TBD - created by archiving change indicator-structure-engine. Update Purpose after archive.
## Requirements
### Requirement: 支撑/压力聚合

系统 SHALL 将各来源(布林轨、VEGAS、斐波那契位、swing、箱体沿、订单块、流动性位)的价位聚合为统一的 S/R 候选列表。每个候选 MUST 含价格、类型(支撑/压力)、来源集合与强度。

#### Scenario: 多来源聚簇合并

- **WHEN** 多个来源在价格容差内给出相近的位
- **THEN** 系统 SHALL 将它们合并为一个候选
- **AND** 强度随命中来源数与触碰次数增加

#### Scenario: 按强度排序输出

- **WHEN** 请求某 series 的 S/R 候选
- **THEN** 系统 SHALL 返回按强度降序、去重后的候选列表

### Requirement: 分析命令输出

系统 SHALL 提供命令,从存储读取某 series 数据并输出指标末值与 Top-N 支撑/压力候选。

#### Scenario: 输出分析结果

- **WHEN** 用户对某品类/币种/级别请求分析
- **THEN** 系统 SHALL 打印关键指标末值与 Top-N S/R 候选(含价格、类型、来源、强度)

