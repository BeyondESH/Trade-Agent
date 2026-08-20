## ADDED Requirements

### Requirement: 全量 series 数据质量门禁
测试系统 SHALL 枚举 `data/parquet` 下的全部 series（category/symbol/timeframe），对每个 series 校验数据质量，作为回归基线。枚举 SHALL 通过扫描存储目录自动发现，而非硬编码列表。
#### Scenario: 自动发现全部 series
- **WHEN** 数据完整性测试运行
- **THEN** 测试 SHALL 发现并校验存储中全部 series，且测试参数化按 series 展开

### Requirement: 时间戳序列校验
每个 series 的 `open_time` 列 SHALL 严格递增且无重复值。
#### Scenario: 递增且无重复
- **WHEN** 读取某 series 的全部 `open_time`
- **THEN** 相邻元素 SHALL 满足 `t[i+1] > t[i]`（等值或回退即失败）

### Requirement: OHLC 数值合法性
每个 series 的每根 K 线 SHALL 满足 OHLC 约束：`high >= max(open, close)`、`low <= min(open, close)`、`volume >= 0`，且 OHLC 均为有限数值。
#### Scenario: OHLC 一致性
- **WHEN** 校验任意 series 的任意 bar
- **THEN** 上述约束 SHALL 全部成立，违反即报告具体 series 与 bar 索引

### Requirement: 相邻 bar 周期对齐
每个 series 的相邻 bar 间隔 SHALL 等于其 timeframe 的 step（毫秒），series 首尾的窗口截断予以豁免。
#### Scenario: 周期步长一致
- **WHEN** 校验某 series 内部任意相邻 bar 的间隔
- **THEN** 间隔 SHALL 等于该 timeframe 的 step_ms，白名单内记录的间隙除外

### Requirement: 缺口三层分类
测试 SHALL 将时间间隙分为三类并分别判定：类型 A（结构性缺失，缺失 ≥ 5 步）登记于 `STRUCTURAL_EXEMPTIONS` 并豁免，不算缺陷；类型 B（微缺口，缺失 1~2 步）登记于 `KNOWN_GAPS` 白名单并作为硬性断言；类型 C（数据停滞，最新 bar 早于 `now - 2*step`）仅在线子集断言。
#### Scenario: 结构性缺失豁免
- **WHEN** 某 series 存在整段历史缺失（≥ 5 步）
- **THEN** 测试 SHALL 将其归类为类型 A，若已在 `STRUCTURAL_EXEMPTIONS` 登记则通过，且不要求回填

#### Scenario: 微缺口硬性判定
- **WHEN** 某 series 存在 1~2 步的缺根且未登记于 `KNOWN_GAPS`
- **THEN** 测试 SHALL 判定失败并输出该 series 的缺失区间明细（起止时间 + 步数）

#### Scenario: 白名单内微缺口豁免
- **WHEN** 某 series 的 1~2 步缺根已登记于 `KNOWN_GAPS`
- **THEN** 测试 SHALL 通过，且白名单条目在数据修复后逐条移除

### Requirement: 已知缺根白名单
测试 SHALL 提供两个注册表：`KNOWN_GAPS[series]`（类型 B 微缺口，硬门禁）与 `STRUCTURAL_EXEMPTIONS[series]`（类型 A 结构性缺失，豁免）。白名单之外的任何类型 B 间隙 SHALL 判定失败并打印缺失区间清单。
#### Scenario: 白名单外微缺口失败
- **WHEN** 某 series 存在未登记于 `KNOWN_GAPS` 的类型 B 时间间隙
- **THEN** 测试 SHALL 失败并输出该 series 的缺失区间明细

#### Scenario: 数值断言独立于缺口分类
- **WHEN** 校验时间戳递增、无重复、OHLC 合法性
- **THEN** 上述断言 SHALL 不受任何豁免影响，违反即失败

### Requirement: 数据停滞检测（可选在线）
测试 SHALL 支持可选校验数据是否停滞：series 最后一条 `open_time` 不早于 `now - 2 * step`。该断言标记为在线子集，离线运行时 SHALL 跳过而非失败。
#### Scenario: 数据新鲜度
- **WHEN** 在线模式下校验某 series 的新鲜度
- **THEN** 最新 `open_time` 与当前时间差 SHALL 不超过 2 个 step，否则报告数据停滞
