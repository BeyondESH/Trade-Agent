## REMOVED Requirements

### Requirement: 交易终端布局

## ADDED Requirements

### Requirement: TV 五区布局壳

系统 SHALL 以"固定四边框 + 中心画布"呈现 TradingView 风格终端布局：顶栏 38px、左绘图栏 52px、中心图表区、右图标条 44px + 右面板（默认 ~300px，可拖 260-500px）、底部抽屉（折叠 30px → 展开 30-40vh）、状态栏 28px；中心图表区 SHALL 吃掉所有剩余空间，四周面板均可折叠/隐藏，折叠后图表全屏铺满。

#### Scenario: 五区分区呈现

- **WHEN** 打开应用（宽屏）
- **THEN** SHALL 显示顶栏、左绘图栏、中心图表、右图标条+面板、底部抽屉、状态栏六个分区，分区间以 1px 分隔线衔接

#### Scenario: 中心吃剩余空间

- **WHEN** 右栏或底部抽屉折叠/隐藏
- **THEN** 中心图表区 SHALL 自动占满释放的空间，不出现留白装饰

#### Scenario: 分隔线可拖拽

- **WHEN** 拖拽右面板左缘或底部抽屉上缘
- **THEN** SHALL 显示 col-resize/row-resize 高亮条并实时调整宽度/高度

#### Scenario: 多图表网格

- **WHEN** 点击顶栏"布局"按钮选择 1/2/3/4/6/8 格
- **THEN** 中心区 SHALL 呈现对应数量的独立图表实例网格，每个实例可独立切换品种/周期

### Requirement: 状态栏

系统 SHALL 在 28px 状态栏展示：时区选择、交易所时钟、数据延迟标识（实时/延迟 badge）、快照、全屏、布局比例，字号 11px；原 TickerBar 的行情信息 SHALL 并入状态栏或右栏，不再以顶部走马灯形式占位。

#### Scenario: 状态栏信息展示

- **WHEN** 加载完成且有实时数据
- **THEN** 状态栏 SHALL 显示时区、时钟与"实时"状态；数据延迟时 SHALL 显示黄色延迟 badge

#### Scenario: 全屏与布局比例

- **WHEN** 点击全屏按钮或调整面板宽度
- **THEN** SHALL 切换浏览器全屏，并显示当前布局比例（如 100%）
