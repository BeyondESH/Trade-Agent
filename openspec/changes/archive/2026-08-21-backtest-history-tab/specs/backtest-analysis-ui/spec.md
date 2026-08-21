## ADDED Requirements

### Requirement: 回测 tab 运行与开单列表

AI Agent 页面 SHALL 提供独立「回测」tab:自含标的/周期/训练参数选择与运行按钮,运行结果 SHALL 展示开单列表表格,含方向、开仓时间/价格、平仓时间/价格、持仓 bar 数、盈亏与收益率。该 tab SHALL 使用 `/config` 中已启用的因子集运行回测,且 SHALL 不提供因子管理 UI。

#### Scenario: 运行回测并展示开单列表

- **WHEN** 用户在回测 tab 点击运行
- **THEN** 系统 SHALL 提交 `/backtest` 并轮询 `/jobs/{id}`
- **AND** 完成后 SHALL 以表格渲染逐笔交易(方向/开仓平仓时间价格/持仓 bar/盈亏/收益率)

#### Scenario: 空交易展示

- **WHEN** 回测结果 trade_list 为空
- **THEN** 表格区 SHALL 显示空态提示而非空白

#### Scenario: 亏损显示

- **WHEN** 交易净利为负
- **THEN** 该行盈亏/收益率 SHALL 以亏损色呈现

### Requirement: 收益经济学图形

回测 tab SHALL 使用 Recharts 渲染四个收益相关图形:月度收益柱状图、单笔交易盈亏柱状图、收益分布直方图、权益与回撤曲线。图形数据 SHALL 由可单测的纯函数计算。

#### Scenario: 月度收益柱状图

- **WHEN** 存在 equity 与 open_time 序列
- **THEN** SHALL 按自然月聚合出月度收益并渲染柱状图,正收益与负收益 SHALL 以不同颜色区分

#### Scenario: 单笔交易盈亏柱状

- **WHEN** 存在 trade_list 列表
- **THEN** SHALL 渲染每笔交易的净利柱,盈利绿/亏损红

#### Scenario: 收益分布直方图

- **WHEN** 存在 equity 序列且点数足够分桶
- **THEN** SHALL 对 equity 差分分桶并渲染频率直方图

#### Scenario: 权益与回撤曲线

- **WHEN** 存在 series
- **THEN** SHALL 渲染权益曲线与回撤曲线

### Requirement: 回测历史回看

回测 tab SHALL 提供历史侧栏:列出历史记录(时间/序列/参数/关键指标),点击某条 SHALL 拉取详情并用其 trade_list 与降采样曲线渲染开单列表与四个图形;历史回看态 SHALL 与实时运行结果可区分。

#### Scenario: 历史列表展示

- **WHEN** 回测 tab 加载或刷新历史
- **THEN** SHALL 调用 GET /backtest/history 并按时间倒序渲染记录列表

#### Scenario: 点击回看详情

- **WHEN** 用户点击某条历史记录
- **THEN** SHALL 调用 GET /backtest/history/{id}
- **AND** 用返回的 trade_list/series 渲染开单列表与图形
- **AND** 界面 SHALL 标注当前为历史回看

#### Scenario: 删除历史记录

- **WHEN** 用户在历史侧栏删除某条记录
- **THEN** SHALL 调用 DELETE /backtest/history/{id} 并从列表移除
