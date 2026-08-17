# chart-sync-bus Specification

## Purpose
TBD - created by archiving change tv-multichart-sync. Update Purpose after archive.
## Requirements
### Requirement: 跨格同步总线

系统 SHALL 提供跨 cell 的同步总线，支持 Symbol / Period / 十字线 / 缩放平移 / 绘图 五类事件的广播与接收；每类同步 SHALL 有独立开关（默认全开）。总线 MUST 通过 `syncOrigin` 标记防止回声循环（镜像产生的变更不再被重新广播）。

#### Scenario: 独立开关

- **WHEN** 关闭"周期同步"但保持其他开关开启
- **THEN** 活动格切周期时其余格 SHALL NOT 跟随，而切品种/十字线仍同步

#### Scenario: 防回声循环

- **WHEN** 一格因接收同步事件而产生变更
- **THEN** 该变更 SHALL 被标记为镜像来源，SHALL NOT 再次被广播回总线

### Requirement: Symbol 与 Period 同步

系统 SHALL 在开关开启时，将活动格的 symbol/period 变更同步到其余格。

#### Scenario: 品种同步

- **WHEN** Symbol 同步开启且活动格切换品种
- **THEN** 其余格 SHALL 加载同一品种

#### Scenario: 周期同步

- **WHEN** Period 同步开启且活动格切换周期
- **THEN** 其余格 SHALL 切换到同一周期

### Requirement: 十字线与缩放同步

系统 SHALL 在开关开启时，按 timestamp 对齐十字线、按可视时间范围对齐缩放/平移；跨周期时以时间坐标（而非像素/索引）对齐。同步 SHALL 经节流（rAF 合并）避免高频抖动。

#### Scenario: 十字线时间对齐

- **WHEN** 十字线同步开启且鼠标悬停某格的某时间点
- **THEN** 其余格 SHALL 在同一 timestamp 处显示十字线竖线（即使周期不同）

#### Scenario: 缩放平移跟随

- **WHEN** 缩放同步开启且拖动/缩放某格的时间轴
- **THEN** 其余格的可视时间范围 SHALL 跟随调整

### Requirement: 绘图同步（同 symbol，按数据坐标）

系统 SHALL 在绘图同步开启时，仅在**同 symbol** 的格之间镜像绘图的创建/修改/删除；镜像 MUST 以数据坐标 `{timestamp, value}` 传递并在目标格按其时间轴重投影，SHALL NOT 以像素/索引镜像；跨 symbol 的格 SHALL NOT 同步绘图。

#### Scenario: 同 symbol 跨周期镜像

- **WHEN** 在 BTC/15m 格画一条趋势线，另有 BTC/1h 格
- **THEN** BTC/1h 格 SHALL 按相同 `{timestamp,value}` 端点重投影出同一条线

#### Scenario: 跨 symbol 不镜像

- **WHEN** 在 BTC 格画线，另有 ETH 格
- **THEN** ETH 格 SHALL NOT 出现该绘图

#### Scenario: 修改与删除同步

- **WHEN** 修改或删除某格已镜像的绘图
- **THEN** 同 symbol 的其余格对应绘图 SHALL 同步修改或删除

