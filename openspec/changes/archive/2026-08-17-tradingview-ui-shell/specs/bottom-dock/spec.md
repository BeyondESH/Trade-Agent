## ADDED Requirements

### Requirement: 底部抽屉与 Tab

系统 SHALL 在底部提供 30px tab 栏（AI 分析 / 回测 / 筛选器 / 交易面板）；Tab 无背景，选中项文字变白 + 底部 2px 蓝色下划线；点击 tab SHALL 向上展开约 30-40vh 高度，上缘 SHALL 可拖拽调整高度并再次折叠。

#### Scenario: 展开与折叠

- **WHEN** 点击某个 tab
- **THEN** 抽屉 SHALL 展开 30-40vh 显示对应内容，该 tab SHALL 显示白色文字与 2px 蓝色下划线；再次点击 SHALL 折叠回 30px

#### Scenario: 高度拖拽

- **WHEN** 拖拽抽屉上缘
- **THEN** 抽屉高度 SHALL 实时调整并在释放后保持

### Requirement: 回测面板

系统 SHALL 在回测 tab 接入 `POST /backtest` 与 `GET /jobs/{job_id}`：配置策略/参数 → 提交回测 → 轮询结果 → 展示收益与指标表格；运行中 SHALL 显示加载态，失败 SHALL 显示错误信息。

#### Scenario: 回测提交与结果

- **WHEN** 配置参数并提交回测
- **THEN** SHALL 创建任务并轮询，完成后展示结果表格；失败时 SHALL 显示错误而非白屏

### Requirement: 筛选器面板

系统 SHALL 在筛选器 tab 复用 MarketList 全屏能力（分类 tab、搜索、排序、虚拟滚动），供用户按多维度筛选品种；选中品种 SHALL 联动图表。

#### Scenario: 筛选与联动

- **WHEN** 在筛选器中对列排序/筛选并点击某品种
- **THEN** SHALL 展示筛选结果并联动切换图表品种

### Requirement: 交易面板

系统 SHALL 在交易面板 tab 展示 `GET /portfolio` 持仓/账户摘要与 `POST /order` 下单表单（沿用现有接口，不改后端）；下单结果与持仓 SHALL 刷新展示，空持仓 SHALL 显示空态。

#### Scenario: 持仓与下单

- **WHEN** 打开交易面板并提交订单
- **THEN** SHALL 展示账户摘要与持仓列表，下单后 SHALL 刷新持仓；无持仓时显示空态
