# chart-replay Specification

## Purpose
TBD - created by archiving change tv-replay-and-alerts. Update Purpose after archive.
## Requirements
### Requirement: 回放引擎

系统 SHALL 提供 bar 回放：用户选择回放起点 bar 后，图表 SHALL 只展示到"当前回放时刻"的历史数据，并按控制逐 bar 前进。回放期间实时推送 SHALL 挂起，退出回放后 SHALL 恢复实时。

#### Scenario: 选择起点并回放

- **WHEN** 进入回放模式并选择某历史 bar 作为起点
- **THEN** 图表 SHALL 裁剪到该 bar 及之前的数据，等待播放控制

#### Scenario: 逐 bar 前进

- **WHEN** 播放或单步前进
- **THEN** 图表 SHALL 逐根追加后续 bar，直至最新或用户暂停

#### Scenario: 回放期间挂起实时

- **WHEN** 处于回放模式
- **THEN** 实时快照推送 SHALL 不改变图表；退出回放后 SHALL 恢复实时更新

### Requirement: 回放控制条

系统 SHALL 在回放模式显示控制条：播放/暂停、单步前进、速度选择、退出、当前回放时间。

#### Scenario: 控制条操作

- **WHEN** 在回放条点击暂停/单步/调速/退出
- **THEN** 回放 SHALL 相应暂停/前进一根/改变速度/退出并恢复实时

#### Scenario: 显示当前回放时间

- **WHEN** 回放进行中
- **THEN** 控制条 SHALL 显示当前回放时刻（时间戳）

