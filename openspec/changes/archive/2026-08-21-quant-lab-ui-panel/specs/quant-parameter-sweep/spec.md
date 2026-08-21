# quant-parameter-sweep Specification

## Purpose
暴露后端 `dlquant.sweep_params` 为 HTTP 接口,前端以阈值×费用热力图 + Popover 明细展示参数网格扫描结果,辅助参数寻优。

## ADDED Requirements

### Requirement: 参数扫描后端接口

系统 SHALL 提供 `POST /backtest/sweep` 接口,接收与 `/backtest` 相同的序列引用、窗口、周期、因子集与模型参数,并接受 `thresholds`(必填)、可选 `fees`/`slippages` 网格取值,返回各组合的指标结果矩阵。响应 SHALL 含 `results` 数组与 `data_meta`(训练/测试样本数与区间)。

#### Scenario: 网格扫描返回

- **WHEN** 客户端提交阈值与费用网格
- **THEN** 响应 SHALL 返回全部 阈值×费用×滑点 组合的结果行(threshold/fee/slippage/total_return/max_drawdown/win_rate/trades)

#### Scenario: 数据不足

- **WHEN** 特征化后有效样本不足
- **THEN** 接口 SHALL 返回 422 错误而非崩溃

#### Scenario: 窗口与周期校验

- **WHEN** 提交非法窗口或周期
- **THEN** 接口 SHALL 复用与 `/backtest` 相同的校验逻辑并返回 422

### Requirement: 参数扫描前端视图

参数扫描 tab SHALL 以热力图展示扫描结果:行=阈值、列=费用,单元格色深映射总收益;悬浮单元格 SHALL 以 Tooltip 显示该组合全指标,点击 SHALL 以 Popover 展示明细。数据缺失或扫描失败 SHALL 显示错误/空态。

#### Scenario: 热力图渲染

- **WHEN** sweep 结果含多阈值×多费用组合
- **THEN** 前端 SHALL 渲染色阶热力图,单元格颜色深浅与 total_return 正负相关(盈利暖色/亏损冷色)

#### Scenario: 单元格 Tooltip

- **WHEN** 用户悬浮某单元格
- **THEN** 显示该组合的 threshold/fee/slippage 与 total_return/max_drawdown/win_rate/trades

#### Scenario: 单元格 Popover 明细

- **WHEN** 用户点击某单元格
- **THEN** 以 Popover 展示该组合完整指标明细

#### Scenario: 空态与错误

- **WHEN** 扫描未执行、结果为错误或无组合
- **THEN** 显示对应空态/错误提示,不渲染空热力图
