## ADDED Requirements

### Requirement: 图表终端渲染与指标

系统 SHALL 用 klinecharts 渲染 K 线,提供币安/欧易式图表终端:主图蜡烛 + 内置指标副图(MACD/KDJ/RSI/VOL 等)与主图叠加(MA/BOLL 等),指标可增删。

#### Scenario: 渲染 K 线

- **WHEN** 提供 candles 数据
- **THEN** 图表 SHALL 显示对应的 K 线蜡烛

#### Scenario: 添加指标副图

- **WHEN** 用户在指标管理面板选择 MACD
- **THEN** 图表 SHALL 在主图下方新增 MACD 副图面板

#### Scenario: 主图叠加指标

- **WHEN** 用户在指标管理面板选择 MA
- **THEN** 图表 SHALL 在主图上叠加 MA 曲线

#### Scenario: 删除指标

- **WHEN** 用户移除某指标
- **THEN** 该指标 SHALL 从对应面板消失且不影响其余面板

### Requirement: 交互作图工具

系统 SHALL 提供交互作图工具箱,支持线段、射线、斐波那契、矩形、价格线、文本标注、自由画笔等 klinecharts 内置工具,以及取消绘制与删除图形。

#### Scenario: 选择工具作图

- **WHEN** 用户选择某作图工具并在图表上点击
- **THEN** 图表 SHALL 进入该工具的交互绘制模式并完成图形

#### Scenario: 取消绘制

- **WHEN** 用户取消当前绘制
- **THEN** 图表 SHALL 退出绘制模式且不残留半成品图形

#### Scenario: 删除图形

- **WHEN** 用户删除某条手绘图形
- **THEN** 该图形 SHALL 从图表移除

### Requirement: 图层分级

系统 SHALL 将图表内容分为三层:指标层、手绘层、自动识别层。自动识别层包含 S/R、结构、SMC 三个可独立开关的子图层,以程序化 overlay 随数据重建;手绘层与自动层互不干扰。

#### Scenario: 自动层开关

- **WHEN** 用户关闭 S/R 图层
- **THEN** S/R 价格线 SHALL 从图表隐藏,其余图层不受影响

#### Scenario: 自动层随数据重建

- **WHEN** candles/analyze/structure 数据更新
- **THEN** 自动层 overlay SHALL 按新数据重新生成

#### Scenario: 手绘与自动层共存

- **WHEN** 图上同时存在用户手绘图形与自动识别图形
- **THEN** 两类图形 SHALL 同时显示且互不影响

### Requirement: 图表状态按 series 持久化

系统 SHALL 将图表状态(指标布局、手绘图形、自动层开关)按 `category/symbol/timeframe` 持久化到后端本地 JSON,提供读写端点;非法或超限状态 MUST 被拒绝。

#### Scenario: 读取图表状态

- **WHEN** 请求 `GET /chart-config?category=..&symbol=..&timeframe=..`
- **THEN** 系统 SHALL 返回该 series 的指标、手绘与图层开关状态(缺失返回空模板)

#### Scenario: 保存图表状态

- **WHEN** 以合法状态 `PUT /chart-config`
- **THEN** 系统 SHALL 持久化并在重新读取时返回新值

#### Scenario: 超限状态被拒

- **WHEN** 单 series 手绘图形数超过上限
- **THEN** 系统 SHALL 拒绝写入并返回错误

### Requirement: 增量更新支持

系统 SHALL 支持对图表最后一根 K 线做增量更新(updateData),以便后续实时 K 线通道消费。

#### Scenario: 增量更新最后一根

- **WHEN** 传入更新的 last_candle
- **THEN** 图表 SHALL 更新最后一根 K 线且不重绘全量数据
