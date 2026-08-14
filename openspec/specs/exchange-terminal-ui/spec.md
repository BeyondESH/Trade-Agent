# exchange-terminal-ui Specification

## Purpose
TBD - created by syncing change exchange-terminal.

## Requirements
### Requirement: OKX 风格终端布局

系统 SHALL 提供复刻欧易（OKX）风格的交易终端布局（不含交易功能），包含：顶部导航与横向行情条、左侧全量市场列表、中栏图表、右栏订单簿与最新成交、底部 AI 分析模块占位。

#### Scenario: 终端整体渲染

- **WHEN** 前端加载终端页面
- **THEN** SHALL 渲染出包含行情条、市场列表、图表、订单簿、成交、底部面板的完整布局

#### Scenario: 图表复用现有终端

- **WHEN** 中栏图表区域挂载
- **THEN** SHALL 复用现有 klinecharts-pro 图表终端（周期条/指标/画线/自动层）

### Requirement: 顶部导航与行情条

系统 SHALL 在顶部提供导航区与横向滚动行情条：导航含产品 Tab（现货/合约）与连接状态；导航左端 SHALL 显示品牌名 `RaiBro Trading`；行情条逐项展示 symbol、最新价、24h 涨跌幅，价格与涨跌用红绿 tokens 着色。

#### Scenario: 品牌名显示

- **WHEN** 前端加载终端页面
- **THEN** 顶部导航左端 SHALL 显示 `RaiBro Trading`

#### Scenario: 行情条实时更新

- **WHEN** ticker 频道推送更新
- **THEN** 行情条 SHALL 更新对应 symbol 的最新价与涨跌幅并保持滚动位置

#### Scenario: 涨跌着色一致

- **WHEN** 行情条展示价格或涨跌幅
- **THEN** 上涨 SHALL 用绿色 token、下跌用红色 token，与设计系统一致

### Requirement: 全量市场列表

系统 SHALL 在左侧提供全量合约市场列表，含多 Tab（行情/自选/合约）、搜索过滤、按列排序（价格/涨跌幅/成交量/成交额），并支持大量行的高效渲染（虚拟滚动）。

#### Scenario: 列表初次加载

- **WHEN** 打开市场列表
- **THEN** SHALL 加载全量合约并按默认排序展示

#### Scenario: 搜索过滤

- **WHEN** 输入搜索关键词
- **THEN** SHALL 仅展示 symbol 匹配的合约

#### Scenario: 按列排序

- **WHEN** 点击某列头（如 24h 涨跌幅）
- **THEN** SHALL 按该列升/降序重排列表

#### Scenario: 列表实时刷新

- **WHEN** ticker 增量推送到达
- **THEN** SHALL 更新对应行的价格与统计且不破坏滚动位置

#### Scenario: 选择联动

- **WHEN** 点击列表某行
- **THEN** SHALL 切换当前 symbol，并联动图表、订单簿、成交、行情条

#### Scenario: 虚拟滚动

- **WHEN** 列表渲染大量合约行
- **THEN** SHALL 仅渲染可视窗口内的行以维持流畅

### Requirement: 订单簿与最新成交

系统 SHALL 在右栏展示所选 symbol 的全深订单簿（买卖盘口、数量、价格档位）与最新成交流（价格、数量、时间、方向），并随订阅增量实时刷新。

#### Scenario: 订单簿快照渲染

- **WHEN** 首次订阅某 symbol 订单簿
- **THEN** SHALL 渲染买卖档位列表，最高价卖单置顶、最低价买单置底并高亮买卖一档

#### Scenario: 订单簿增量更新

- **WHEN** 收到 `update` 增量帧
- **THEN** SHALL 合并档位：`size="0"` 移除对应档，其余更新数量，价格精度按 `/instruments` 元数据格式化

#### Scenario: 最新成交追加

- **WHEN** 收到 trade 增量
- **THEN** SHALL 在成交流顶部追加新成交并保留最近 N 笔

#### Scenario: 切币联动

- **WHEN** 用户切换 symbol
- **THEN** SHALL 重新拉取订单簿快照与成交历史并退订旧 symbol

### Requirement: 资金费率与标记价格

系统 SHALL 在终端展示所选 symbol 的资金费率与标记价格信息，并随实时频道更新。

#### Scenario: 展示资金费率

- **WHEN** 资金费率频道推送更新
- **THEN** SHALL 展示当前资金费率及结算周期信息

#### Scenario: 展示标记价格

- **WHEN** 标记价格频道推送更新
- **THEN** SHALL 展示最新标记价格及其相对最新价的差值/百分比

### Requirement: 底部 AI 分析占位

系统 SHALL 在终端底部保留 AI 分析模块区域，本期仅渲染占位容器，不实现分析功能（后续 change 填充）。

#### Scenario: 占位渲染

- **WHEN** 终端加载
- **THEN** 底部 SHALL 渲染 AI 分析模块占位区域而不报错
