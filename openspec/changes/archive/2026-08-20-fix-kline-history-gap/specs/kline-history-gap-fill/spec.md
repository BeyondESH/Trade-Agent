## ADDED Requirements

### Requirement: 历史数据 gap 补齐
系统 SHALL 保证图表历史数据在任意时刻呈现连续的时间序列，不得因 store 与实时 buffer 之间存在缺口而显示空洞。图表加载历史时，系统 SHALL 将实时 buffer 中比 store 已存最新 bar 更新的部分合并进历史结果，且返回序列 SHALL 按 `timestamp` 严格升序、无重复 bar。

#### Scenario: store 缺段时图表仍连续
- **WHEN** store 中某 series 的历史止于时刻 T，而实时 buffer 含有 T 之后的新 bar
- **THEN** 图表加载历史 SHALL 返回包含 T 之后 buffer 数据的连续升序序列，不得跳过中间时段

#### Scenario: 合并结果保持升序去重
- **WHEN** store 数据与 buffer 数据存在时间重叠或交叉
- **THEN** 合并结果 SHALL 按 `timestamp` 严格升序且无重复 bar

#### Scenario: store 完整时不受影响
- **WHEN** store 已包含到最新时刻的完整数据
- **THEN** 图表加载历史 SHALL 直接返回 store 数据，不得引入重复或乱序

### Requirement: webapi 常驻增量落盘
系统 SHALL 使增量落盘任务在 webapi 常驻运行时（FastAPI lifespan）自动启动并周期执行，使实时数据持续写入 parquet store，不依赖手动 CLI 命令。任务 SHALL 按可配置周期运行，单目标失败 SHALL 仅记录日志而不影响后续调度。

#### Scenario: 启动即开始增量落盘
- **WHEN** webapi 应用启动完成 lifespan 初始化
- **THEN** 增量落盘 scheduler SHALL 已启动，并按配置周期执行

#### Scenario: 单个目标失败不中断调度
- **WHEN** 某 symbol/timeframe 的增量拉取失败
- **THEN** 系统 SHALL 记录错误日志，且后续周期调度 SHALL 继续执行

#### Scenario: 关闭时释放调度器
- **WHEN** webapi 应用关闭
- **THEN** 增量落盘 scheduler SHALL 被正常关闭，不留后台任务
