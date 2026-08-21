# quant-walk-forward Specification

## Purpose
Walk-forward 折数交互化:`n_splits` 由硬编码改为可调控件,用户可控制验证折数。

## ADDED Requirements

### Requirement: 折数可调

QUANT LAB Walk-forward 视图 SHALL 提供折数 `n_splits` 输入(滑杆或数字),默认值与现状一致(后端按数据量自适应);提交时 SHALL 将所选折数传给后端;后端数据不足无法满足折数时 SHALL 返回明确错误并透出到 UI。

#### Scenario: 自定义折数

- **WHEN** 用户将折数设为 8 并运行 Walk-forward
- **THEN** 请求 SHALL 携带 `n_splits=8`,结果表 SHALL 渲染 8 折指标

#### Scenario: 折数非法或数据不足

- **WHEN** 请求折数超过数据可切分上限
- **THEN** 后端 SHALL 返回错误信息,前端 SHALL 以横幅展示而非崩溃
