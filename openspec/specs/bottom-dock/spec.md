# bottom-dock Specification

## Purpose
TBD - created by archiving change tradingview-ui-shell. Update Purpose after archive.
## Requirements
### Requirement: 底部抽屉与 Tab

系统 SHALL 在底部提供 30px tab 栏（交易面板 / 筛选器 / 策略回测 / 文本备注）；tab 栏 SHALL NOT 包含 Pine 编辑项——Pine 脚本编辑器与本项目实际策略执行路径（后端 DL 量化引擎）不符，已整体移除。Tab 无背景，选中项文字变白 + 底部 2px 蓝色下划线；点击 tab SHALL 展开抽屉显示对应内容并可再次点击折叠，抽屉 SHALL 提供常规与最大化两档目标高度供用户调整抽屉高度。展开时抽屉 SHALL 以其目标高度完整呈现内容，当内容超出目标高度时 SHALL 由工作区整体纵向滚动继续揭示完整内容，MUST NOT 强制内容仅在抽屉内二次滚动。展开时中心图表区 SHALL 保留确定的最小高度（等于折叠态下的图表可用高度）以保证图表容器可正确测量尺寸，抽屉与图表 SHALL NOT 相互重叠。折叠态 SHALL 无任何工作区滚动。

#### Scenario: 展开与折叠

- **WHEN** 点击某个 tab
- **THEN** 抽屉 SHALL 展开为目标高度显示对应内容，该 tab SHALL 显示白色文字与 2px 蓝色下划线；再次点击 SHALL 折叠回 30px 且工作区恢复不可滚动

#### Scenario: 无 Pine 编辑 tab

- **WHEN** 查看底部 tab 栏
- **THEN** SHALL 仅呈现交易面板 / 筛选器 / 策略回测 / 文本备注四项，SHALL NOT 出现 Pine 编辑 tab
- **AND** 底部 tab 类型 SHALL NOT 包含 `'pine'`

#### Scenario: 展开不与图表重叠

- **WHEN** 抽屉展开且面板内容超过抽屉目标高度
- **THEN** 中心图表区 SHALL 保留等于折叠态可用高度的最小高度，图表 SHALL 正常渲染且 SHALL NOT 与抽屉重叠或被压缩至塌陷，超出抽屉的内容 SHALL 由工作区整体纵向滚动揭示

#### Scenario: 高度拖拽

- **WHEN** 在展开态调整抽屉高度（通过常规/最大化切换控件）
- **THEN** 抽屉目标高度 SHALL 相应在两档间切换，内容 SHALL 随之重新铺开（内容超出时由工作区滚动），工作区滚动范围 SHALL 同步更新

#### Scenario: 展开后可整体滚动看完底部模块

- **WHEN** 抽屉展开且面板内容超过视口可见范围
- **THEN** 工作区 SHALL 可纵向滚动，向下滚动 SHALL 呈现完整的底部模块内容，MUST NOT 要求用户在抽屉内二次滚动

#### Scenario: 展开时自动定位到底部模块

- **WHEN** 抽屉由折叠态变为展开态
- **THEN** 工作区 SHALL 自动滚动定位到底部模块，使用户立即看到展开的内容

#### Scenario: 自动定位不劫持用户滚动

- **WHEN** 抽屉已处于展开态且用户手动滚动工作区，或在展开态下切换 tab
- **THEN** 系统 SHALL NOT 再次强制滚动定位，用户的滚动位置 SHALL 被保留

### Requirement: 回测面板

系统 SHALL 在回测 tab 接入 `POST /backtest` 与 `GET /jobs/{job_id}`：配置策略/参数 → 提交回测 → 轮询结果 → 展示收益与指标表格；运行中 SHALL 显示加载态，失败 SHALL 显示错误信息。回测结果 state 与其后端调用链路 SHALL 独立于任何脚本编辑器界面而存在，SHALL 可由未来新增的策略配置界面触发。

#### Scenario: 回测提交与结果

- **WHEN** 配置参数并提交回测
- **THEN** SHALL 创建任务并轮询，完成后展示结果表格；失败时 SHALL 显示错误而非白屏

#### Scenario: 回测链路不依赖脚本编辑器

- **WHEN** Pine 编辑器界面已被移除
- **THEN** 回测结果 state 与后端 `POST /backtest` + `GET /jobs/{job_id}` 调用链路 SHALL 仍完整保留，策略回测 tab SHALL 正常渲染结果
- **AND** 底部抽屉组件 SHALL NOT 再要求传入脚本运行回调

### Requirement: 筛选器面板

系统 SHALL 在筛选器 tab 复用 MarketList 全屏能力（分类 tab、搜索、排序、虚拟滚动），并 SHALL 消费实时行情 hub 的 ticker 数据源（`useTickerList`，`/tickers` 快照 + `/ws` `ticker/default` 增量）驱动全部行；系统 MUST NOT 渲染 `INITIAL_SCREENER_ITEMS` 等静态 mock 数组作为行情来源。筛选器 SHALL 提供基于 Bitget 已有维度的"基本面"列：资金费率、标记价、24h 振幅（(high24h-low24h)/low24h 作为波动率代理）、24h 成交量/成交额，各列可排序；数据 SHALL 全部取自行情 hub 已有字段，MUST NOT 引入外部基本面数据源。当某维度字段在 hub 缺失时，该单元格 SHALL 显示占位（如 `--`）并排到排序末尾，MUST NOT 以静态 mock 数值填充。选中品种 SHALL 联动图表。

#### Scenario: 基本面列展示与排序

- **WHEN** 打开筛选器并按资金费率或振幅列排序
- **THEN** SHALL 展示资金费率/标记价/24h 振幅/量额列并按所选列排序

#### Scenario: 筛选与联动

- **WHEN** 在筛选器中筛选并点击某品种
- **THEN** SHALL 展示筛选结果并按 `category:instId` 联动切换图表品种

#### Scenario: 仅用 Bitget 维度

- **WHEN** 渲染基本面列
- **THEN** 每列数值 SHALL 来自 hub 已有字段（fundingRate/markPrice/high24h/low24h/成交量额），SHALL NOT 依赖外部数据源

#### Scenario: 实时驱动的行数据

- **WHEN** `/ws` `ticker/default` 推送某 instId 的价格或基本面字段更新
- **THEN** 对应行 SHALL 就地更新，且列表 MUST NOT 回退渲染静态 mock 数组

#### Scenario: 缺失维度显示占位

- **WHEN** 某 instId 的 hub 数据不含振幅或成交额字段
- **THEN** 该单元格 SHALL 显示占位（如 `--`）并排到排序末尾，MUST NOT 以 mock 数值填充

### Requirement: 交易面板

系统 SHALL 在交易面板 tab 展示 `GET /portfolio` 持仓/账户摘要与 `POST /order` 下单表单（沿用现有接口，不改后端）；下单结果与持仓 SHALL 刷新展示，空持仓 SHALL 显示空态。交易面板 SHALL 同时提供可用的「Trade History」子 tab，经 `GET /journal` 拉取并展示持久化交易记录（品种 / 方向 / 开仓价 / 平仓价 / 盈亏 / 平仓原因，未平仓或缺失字段以占位符显示）；进入该子 tab SHALL 触发拉取并展示加载态，记录为空时 SHALL 显示空态，请求失败时 SHALL 显示错误信息而非空白面板；该视图 MUST 为只读，MUST NOT 修改订单或持仓。

#### Scenario: 持仓与下单

- **WHEN** 打开交易面板并提交订单
- **THEN** SHALL 展示账户摘要与持仓列表，下单后 SHALL 刷新持仓；无持仓时显示空态

#### Scenario: 交易历史渲染

- **WHEN** 用户切换到 Trade History 子 tab 且 `GET /journal` 返回交易记录
- **THEN** SHALL 以表格渲染每条记录的品种 / 方向 / 开仓价 / 平仓价 / 盈亏 / 平仓原因
- **AND** `exit_price`/`pnl` 等缺失字段 SHALL 以占位符显示

#### Scenario: 交易历史空态

- **WHEN** `GET /journal` 返回空记录集
- **THEN** SHALL 显示「暂无交易历史」空态文案，而非空白面板

#### Scenario: 交易历史加载与错误态

- **WHEN** 正在拉取交易历史或拉取失败
- **THEN** SHALL 分别显示加载态或错误信息，且交易面板其余子 tab SHALL 保持可用

#### Scenario: 交易历史只读

- **WHEN** 用户查看 Trade History 子 tab
- **THEN** SHALL NOT 产生任何下单、撤单或平仓操作，MUST NOT 修改本地模拟账户与挂单

