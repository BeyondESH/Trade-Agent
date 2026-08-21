# quant-model-control Specification

## Purpose
TBD - created by archiving change quant-lab-interactive-workbench. Update Purpose after archive.
## Requirements
### Requirement: 模型选择与超参滑杆

QUANT LAB SHALL 提供模型选择(lr / hgb)与对应超参滑杆控件:lr 暴露 `C`/`max_iter`/`solver`,hgb 暴露 `max_depth`/`learning_rate`/`min_samples_leaf`;每个滑杆 SHALL 配套数字输入框以支持精确值,二者共享同一状态源。StandardScaler SHALL 提供启用开关。

#### Scenario: 切换模型显示对应超参

- **WHEN** 用户在模型选择中从 lr 切换为 hgb
- **THEN** 超参面板 SHALL 显示 hgb 的 max_depth/learning_rate/min_samples_leaf 滑杆,隐藏 lr 专属的 C/solver 滑杆

#### Scenario: 滑杆与输入框同步

- **WHEN** 用户拖动 fee 滑杆或直接在数字输入框键入新值
- **THEN** 两者 SHALL 显示同一数值,后续回测请求携带该值

#### Scenario: StandardScaler 开关

- **WHEN** 用户关闭 StandardScaler 开关
- **THEN** 回测请求 SHALL 携带 `scale=False` 类标记,后端不再对该模型应用标准化

### Requirement: 预设模板

QUANT LAB SHALL 提供 4 套模型预设模板:稳健 lr / 激进 lr / HGB 快速 / 自定义。模板 SHALL 打包完整参数快照(模型类型 + 全部超参 + 回测执行参数),一键应用。当前参数快照与某模板完全一致时 SHALL 高亮该模板;用户修改任一参数后 SHALL 自动降级为"自定义"。

#### Scenario: 一键应用预设

- **WHEN** 用户点击「HGB 快速」模板
- **THEN** 模型类型 SHALL 切换为 hgb,对应超参与回测执行参数 SHALL 全部更新为该模板快照

#### Scenario: 参数偏离降级为自定义

- **WHEN** 应用「稳健 lr」后用户拖动 C 滑杆
- **THEN** 模板高亮 SHALL 从「稳健 lr」切换为「自定义」

### Requirement: 回测执行参数

QUANT LAB SHALL 暴露回测执行参数 `init_cash`(初始资金)与 `size`(每笔仓位)输入,与 fee/slippage 一同参与回测请求;缺省值 SHALL 与当前后端默认行为一致。

#### Scenario: 自定义资金与仓位

- **WHEN** 用户输入初始资金 100000 与仓位 0.1
- **THEN** 回测请求 SHALL 携带 `params.init_cash=100000` 与 `params.size=0.1`,后端回测 SHALL 按该资金与仓位计算权益曲线

#### Scenario: 缺省行为兼容

- **WHEN** 用户不修改资金/仓位字段
- **THEN** 回测请求 SHALL 使用与现状一致的默认值,既有测试与历史结果不改变

