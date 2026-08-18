## REMOVED Requirements

### Requirement: TV 五区布局壳
**Reason**: 回退单图,原"多图表网格"与"可配置同步"场景不再适用;中心图表区改为单个原生 `KLineChartPro` 终端。
**Migration**: 由新增要求「TV 布局壳(单图)」取代;五区分区呈现、中心吃剩余空间、分隔线可拖拽、状态栏等仍在新要求中生效。

## ADDED Requirements

### Requirement: TV 布局壳(单图)
系统 SHALL 以"固定四边框 + 中心画布"呈现 TradingView 风格终端布局:顶栏(极简单品种条)、中心图表区、右图标杆 44px + 右侧面板(默认 ~300px,可拖 260-500px)、底部抽屉(折叠 30px → 展开 20-40vh)、状态栏 28px;中心图表区 SHALL 吃掉所有剩余空间,四周面板均可折叠/隐藏,折叠后图表全屏铺满。中心图表区 SHALL 呈现**单个** klinecharts-pro 原生终端(自带原生周期栏与左侧绘图栏),不再有多图表网格、唯一活动格或跨格同步。

#### Scenario: 五区分区呈现
- **WHEN** 打开应用(宽屏)
- **THEN** SHALL 显示顶栏、中心图表(含 Pro 原生周期栏/绘图栏)、右图标杆/面板、底部抽屉、状态栏,分区间以 1px 分隔线隔开

#### Scenario: 中心吃剩余空间
- **WHEN** 右栏或底部抽屉折叠/隐藏
- **THEN** 中心图表区 SHALL 自动占满释放的空间,不出现留白

#### Scenario: 分隔线可拖拽
- **WHEN** 拖拽右面板左缘或底部抽屉上缘
- **THEN** SHALL 显示 col-resize/row-resize 高亮条并实时调整宽度/高度

#### Scenario: 单图终端
- **WHEN** 查看图表区
- **THEN** SHALL 呈现单个 klinecharts-pro 原生实例
- **AND** SHALL 不提供多图布局按钮、活动格切换与跨格同步
