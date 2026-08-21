# backtest-analysis-ui Specification

## Purpose
AI Agent 页面的独立「回测」tab:运行回测并展示开单列表、收益经济学图形(Recharts),并提供历史回看交互。
## Requirements
### Requirement: 回测 tab 运行与开单列表

AI Agent 页面 SHALL 提供量化研究面板(QUANT LAB)下的「开单明细」视图:自含标的/周期/训练参数选择与运行按钮(共享面板参数状态),运行结果 SHALL 展示开单列表表格,含方向、开仓时间/价格、平仓时间/价格、持仓 bar 数、盈亏与收益率,表格 SHALL 支持按净利/方向等列排序。该视图 SHALL 使用 `/config` 中已启用的因子集运行回测,且 SHALL 不提供因子管理 UI(因子管理位于「因子 IC」视图)。

#### Scenario: 运行回测并展示开单列表

- **WHEN** 用户在开单明细视图点击运行
- **THEN** 系统 SHALL 提交 `/backtest` 并轮询 `/jobs/{id}`
- **AND** 完成后 SHALL 以可排序表格渲染逐笔交易(方向/开仓平仓时间价格/持仓 bar/盈亏/收益率)

#### Scenario: 空交易展示

- **WHEN** 回测结果 trade_list 为空
- **THEN** 表格区 SHALL 显示空态提示而非空白

#### Scenario: 亏损显示

- **WHEN** 交易净利为负
- **THEN** 该行盈亏/收益率 SHALL 以亏损色呈现

#### Scenario: 列排序

- **WHEN** 用户点击表头列(净利/方向等)
- **THEN** 该列 SHALL 升/降序切换并重排行

### Requirement: 收益经济学图形

回测 tab SHALL 使用 Recharts 渲染收益相关图形:月度收益(默认年×月热力图,可切换柱状图)、单笔交易盈亏柱状图、收益分布直方图、权益与回撤曲线(权益 SHALL 叠加 buy&hold 基准线)、proba 时间序列 + 阈值带。图形数据 SHALL 由可单测的纯函数计算。

#### Scenario: 月度收益柱状图

- **WHEN** 存在 equity 与 open_time 序列
- **THEN** SHALL 按年×月聚合出月度收益并渲染热力图(正收益与负收益以不同颜色区分),可切换为柱状图

#### Scenario: 单笔交易盈亏柱状

- **WHEN** 存在 trade_list 列表
- **THEN** SHALL 渲染每笔交易的净利柱,盈利绿/亏损红

#### Scenario: 收益分布直方图

- **WHEN** 存在 equity 序列且点数足够分桶
- **THEN** SHALL 对 equity 差分分桶并渲染频率直方图

#### Scenario: 权益与回撤曲线

- **WHEN** 存在 series 且含 `benchmark` 序列
- **THEN** SHALL 渲染权益曲线与回撤曲线,并在权益图叠加 buy&hold 基准线
- **AND** `benchmark` 缺失时 SHALL 仅渲染权益曲线,不报错

#### Scenario: proba 与阈值带

- **WHEN** series 含 proba 序列
- **THEN** SHALL 渲染 proba 时间序列,并绘制 `thresh` 与 `1-thresh` 两条阈值线标识信号切分边界

### Requirement: 回测历史回看

QUANT LAB 的「历史」视图 SHALL 提供历史列表与详情回看:列出历史记录(时间/序列/参数/关键指标),点击某条 SHALL 拉取详情并用其 trade_list、降采样曲线与完整指标(stats/model_metrics,如存在)渲染开单列表与图形;历史回看态 SHALL 与实时运行结果可区分。

#### Scenario: 历史列表展示

- **WHEN** 历史视图加载或刷新历史
- **THEN** SHALL 调用 GET /backtest/history 并按时间倒序渲染记录列表

#### Scenario: 点击回看详情

- **WHEN** 用户点击某条历史记录
- **THEN** SHALL 调用 GET /backtest/history/{id}
- **AND** 用返回的 trade_list/series 渲染开单列表与图形
- **AND** 界面 SHALL 标注当前为历史回看

#### Scenario: 历史详情指标展示

- **WHEN** 历史记录详情含 stats 或 model_metrics
- **THEN** 指标卡组 SHALL 呈现该记录的完整指标;字段缺失时 SHALL 显示占位符

#### Scenario: 删除历史记录

- **WHEN** 用户在历史视图删除某条记录
- **THEN** SHALL 调用 DELETE /backtest/history/{id} 并从列表移除

#### Scenario: 旧引擎记录兼容

- **WHEN** 记录被标记为 legacy(旧引擎 schema)
- **THEN** 界面 SHALL 提示字段口径差异,仅允许删除,不渲染指标

### Requirement: 基准序列计算

前端 SHALL 支持基准曲线渲染:优先使用后端返回的 `series.benchmark`;后端缺失时 SHALL 尝试用 equity 首值归一化 `close`(若前端已有 close 数据)或显示无基准提示。纯函数 `benchmarkSeries` SHALL 可单测。

#### Scenario: 后端基准优先

- **WHEN** 回测结果含 `series.benchmark`
- **THEN** 权益图 SHALL 使用该序列绘制基准线

#### Scenario: 缺失降级

- **WHEN** 回测结果不含 `series.benchmark` 且前端无 close 序列
- **THEN** 权益图 SHALL 仅渲染权益曲线并显示"无基准"占位提示

