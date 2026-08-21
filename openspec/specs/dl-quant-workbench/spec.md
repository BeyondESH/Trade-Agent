# dl-quant-workbench Specification

## Purpose
TBD - created by archiving change ai-agent-page. Update Purpose after archive.
## Requirements
### Requirement: 数据可用性提示

在用户运行回测之前,系统 SHALL 展示所选序列的 bar 数与日期范围(采样自 /candles),并在数据稀疏时给出警告。

#### Scenario: 展示可用性

- **WHEN** 用户在 DL 工作台选择标的/周期
- **THEN** 系统 SHALL 展示从后端获取的 bar 数与日期范围

#### Scenario: 稀疏警告

- **WHEN** 获取到的 bar 数低于阈值(如 500)
- **THEN** 系统 SHALL 显示稀疏数据警告并提示可回填

### Requirement: 回测运行与结果可视化

系统 SHALL 允许用户以可调训练参数(train_ratio/threshold/fee/slippage)运行一次 walk-forward 回测,并渲染指标卡与权益/回撤曲线(内联 SVG,对齐时间戳)。

#### Scenario: 运行回测

- **WHEN** 用户以某组训练参数点击 Run Backtest
- **THEN** 系统 SHALL POST /backtest 并轮询 /jobs/{id} 直至完成
- **AND** 渲染指标卡(total_return / max_drawdown / win_rate / trades / bars)

#### Scenario: 曲线渲染

- **WHEN** 一次完成的回测包含 equity/drawdown 序列
- **THEN** 系统 SHALL 以内联 SVG 渲染权益与回撤两条曲线,时间轴对齐返回的 open_time

#### Scenario: 参数变更重跑

- **WHEN** 用户修改任一训练参数并重新运行
- **THEN** 系统 SHALL 启动新的回测任务并替换上一次的结果展示

### Requirement: 周期范围

DL 工作台的周期选择 SHALL 限定为 1m/1h/4h/1d,默认 1h;稀疏盘面周期(如 5m)不得出现在周期列表中。

#### Scenario: 周期列表

- **WHEN** 用户展开周期下拉
- **THEN** 选项 SHALL 为 1m、1h、4h、1d,且默认选中 1h

