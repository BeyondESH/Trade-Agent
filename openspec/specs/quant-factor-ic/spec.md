# quant-factor-ic Specification

## Purpose
TBD - created by archiving change quant-lab-interactive-workbench. Update Purpose after archive.
## Requirements
### Requirement: IC 时序趋势图

因子 IC 视图 SHALL 在表格基础上渲染 IC 时序趋势图:展示各启用因子在时间窗口内的逐期 IC 变化(依赖后端返回逐期 IC 或前端按窗口聚合);数据不足或后端未返回时序时 SHALL 显示空态。

#### Scenario: 渲染 IC 时序

- **WHEN** 后端返回各因子逐期 IC 时序数据
- **THEN** SHALL 以折线图渲染各因子 IC 随时间变化,因子间以不同颜色区分

#### Scenario: 无时序数据降级

- **WHEN** 后端仅返回聚合 IC 而无逐期数据
- **THEN** 时序图 SHALL 显示空态提示,表格仍正常展示

