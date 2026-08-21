# quant-lab-panel Specification

## Purpose
QUANT LAB 面板结构升级:新增「信号K线」与「模型诊断」tab、tab 受控化并在回测成功后自动跳转、参数条滑杆化、pipeline 级错误横幅透出。

## ADDED Requirements

### Requirement: 新增信号K线与模型诊断 tab

QUANT LAB SHALL 在现有 tab 结构(曲线分析/参数扫描/Walk-forward/因子 IC/开单明细/历史)基础上新增「信号K线」与「模型诊断」两个视图,共享同一标的/周期/区间/模型/参数状态。

#### Scenario: 新 tab 可见且共享状态

- **WHEN** 用户进入 QUANT LAB
- **THEN** SHALL 看到「信号K线」与「模型诊断」tab,且其内容 SHALL 使用参数条当前状态

### Requirement: Tab 受控化与自动跳转

QUANT LAB 的 tab 激活状态 SHALL 由受控状态管理(非默认值模式),以支持编程切换;回测成功完成后 SHALL 自动激活「信号K线」tab。

#### Scenario: 运行成功后自动激活信号K线

- **WHEN** 回测 job 完成且返回有效结果
- **THEN** 激活 tab SHALL 变为「信号K线」

#### Scenario: 手动切换仍可用

- **WHEN** 用户点击任意 tab
- **THEN** 激活状态 SHALL 切换为用户所选 tab,且后续运行成功会再次自动跳转

### Requirement: 参数条滑杆化

QUANT LAB 参数条中连续型参数(训练比例/信号阈值/手续费/滑点,及模型超参)SHALL 以滑杆 + 数字输入双模式呈现,替代纯数字输入框;滑杆 SHALL 提供合理取值范围与刻度。

#### Scenario: 滑杆调节参数

- **WHEN** 用户拖动「信号阈值」滑杆
- **THEN** 数字输入框 SHALL 同步显示新值,后续回测 SHALL 使用该阈值

### Requirement: Pipeline 级错误横幅透出

QUANT LAB SHALL 将 `job.result.error`(pipeline 级失败,如特征行不足)透出为错误横幅;回测结果状态 SHALL 不因 pipeline 错误而渲染空图表。

#### Scenario: pipeline 错误透出

- **WHEN** 回测 job 状态为 done 但其 result 含 error 字段
- **THEN** QUANT LAB SHALL 显示该错误信息横幅,且不渲染基于缺失 series 的图表

#### Scenario: 历史 legacy 记录提示

- **WHEN** 用户点击 history 中的 legacy 记录
- **THEN** SHALL 明确提示该记录来自旧引擎且不可回看图形,而非渲染空图表
