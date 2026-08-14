## ADDED Requirements

### Requirement: 摆动点识别

系统 SHALL 用分形法识别摆动高点(swing high)与摆动低点(swing low),窗口大小可配。

#### Scenario: 识别 swing

- **WHEN** 传入 OHLCV 帧与窗口 k
- **THEN** 系统 SHALL 返回各 swing high/low 的位置(open_time)与价格

### Requirement: 趋势线拟合

系统 SHALL 基于最近的 swing 高点与低点分别拟合上/下趋势线,输出斜率、截距与在当前 bar 的投影值。

#### Scenario: 输出上下趋势线

- **WHEN** 存在至少两个 swing high 与两个 swing low
- **THEN** 系统 SHALL 返回上趋势线与下趋势线的参数与当前投影价

### Requirement: 箱体识别

系统 SHALL 识别近段价格的震荡箱体,输出箱体上下沿;当不满足箱体条件时返回空。

#### Scenario: 检测到箱体

- **WHEN** 近段价格在一个区间内反复触碰上下沿且宽度在阈值内
- **THEN** 系统 SHALL 返回箱体的上沿与下沿价格

#### Scenario: 无箱体

- **WHEN** 近段为明显单边趋势
- **THEN** 系统 SHALL 返回空箱体结果
