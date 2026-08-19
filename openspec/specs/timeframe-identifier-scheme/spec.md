# timeframe-identifier-scheme Specification

## Purpose
TBD - created by archiving change kline-native-period-selector. Update Purpose after archive.
## Requirements
### Requirement: 时间级别标识符全集

系统 SHALL 定义覆盖 Bitget 原生全集的时间级别标识符,包含秒级 1 项、分钟级 5 项(1/3/5/15/30 分钟)、小时级 5 项(1/2/4/6/12 小时)、天级 2 项(1 天、3 天)、周级 1 项、月级 1 项,共 13 项。系统 MUST NOT 定义任何非交易所原生的合成级别。

#### Scenario: 全集可被解析

- **WHEN** 传入原生全集中的任一时间级别标识符
- **THEN** 系统 SHALL 成功解析出对应的步长与交易所粒度 token
- **AND** 不抛出未支持异常

#### Scenario: 拒绝非原生级别

- **WHEN** 传入交易所未原生支持的级别(如 15 秒、6 月、1 年、3 年)
- **THEN** 系统 SHALL 拒绝该级别并给出明确的未支持提示
- **AND** MUST NOT 静默降级为其他级别

### Requirement: 月级与分钟级标识符消歧

系统 SHALL 保证月级与分钟级时间级别的标识符在**大小写无关比较**下也不相互冲突。时间级别的归一化处理 MUST NOT 使月级与分钟级收敛为同一标识符。

#### Scenario: 月级与分钟级互不折叠

- **WHEN** 分别以月级标识符与分钟级标识符请求同一品种
- **THEN** 系统 SHALL 分别返回月级序列与分钟级序列
- **AND** 两者的存储位置与交易所粒度 token MUST 不同

#### Scenario: 大小写容错不引入歧义

- **WHEN** 以不同大小写形式传入同一时间级别
- **THEN** 系统 SHALL 解析为同一级别
- **AND** 该容错 MUST NOT 导致月级被解析为分钟级

#### Scenario: 月级序列独立存储

- **WHEN** 月级数据落盘
- **THEN** 其存储路径 SHALL 与分钟级序列的路径互不覆盖

### Requirement: 前后端标识符往返一致

前端图表周期对象与后端时间级别标识符之间 SHALL 支持双向转换,且对原生全集中的每一项 MUST 满足往返一致:由标识符转为周期对象再转回,得到的标识符与原标识符相同。

#### Scenario: 全集往返一致

- **WHEN** 对原生全集中任一级别执行「标识符 → 周期对象 → 标识符」转换
- **THEN** 结果 SHALL 与初始标识符完全一致

#### Scenario: 秒级与周级月级正确转换

- **WHEN** 转换秒级、周级或月级标识符
- **THEN** 系统 SHALL 产出对应时间跨度的周期对象
- **AND** MUST NOT 回落为分钟级默认值

#### Scenario: 未知标识符可被察觉

- **WHEN** 传入无法识别的时间级别标识符
- **THEN** 系统 SHALL 以可被调用方察觉的方式表明无法识别
- **AND** MUST NOT 静默替换为某个默认级别

