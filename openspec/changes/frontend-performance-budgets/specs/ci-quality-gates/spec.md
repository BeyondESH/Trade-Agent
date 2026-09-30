## ADDED Requirements

### Requirement: 前端性能门禁

CI SHALL 包含前端性能门禁，校验 `frontend-performance-budgets` 定义的预算。门禁 SHALL 为独立作业，其失败 SHALL 阻断该次集成的整体检查结果；其暂时无法运行（如浏览器不可获取）SHALL 明确失败或显式跳过并记录，MUST NOT 静默通过。

性能门禁 SHALL 与既有静态检查、单测、覆盖率门禁并列，MUST NOT 通过削弱既有门禁的方式为性能检查腾出时间。

#### Scenario: 性能预算超限阻断
- **WHEN** 提交使某项性能预算超限且无豁免记录
- **THEN** CI 的性能门禁 SHALL 失败并使整体检查失败

#### Scenario: 门禁不可静默通过
- **WHEN** 性能门禁因环境原因无法执行（例如缺少浏览器）
- **THEN** 该作业 SHALL 显式报告跳过或失败并留下记录，MUST NOT 以成功状态结束

#### Scenario: 不削弱既有门禁
- **WHEN** 引入性能门禁
- **THEN** ruff / Biome / typecheck / 单测 / 覆盖率的既有门禁 SHALL 保持不变或更严

### Requirement: 性能基线的棘轮记录

仓库 SHALL 以文档形式记录性能基线（含测量元数据），并 SHALL 遵循"只升不降"的棘轮策略：基线数值可随实测收紧，放宽 SHALL 需要附证据的变更。

#### Scenario: 基线有档可查
- **WHEN** 需要了解当前性能基线
- **THEN** 仓库 SHALL 包含记录各指标基线值及其测量条件（节流档位、缓存状态、样本数）的文档

#### Scenario: 基线变更留痕
- **WHEN** 基线数值被修改
- **THEN** 该修改 SHALL 在同一变更中说明原因与实测依据
