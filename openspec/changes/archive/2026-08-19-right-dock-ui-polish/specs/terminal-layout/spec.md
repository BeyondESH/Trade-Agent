## MODIFIED Requirements

### Requirement: TV 布局壳(单图)

系统 SHALL 以"固定四边框 + 中心画布"呈现 TradingView 风格终端布局:顶栏(极简单品种条)、中心图表区、右图标杆 44px + 右侧面板(默认 ~300px,可拖 260-500px)、底部抽屉(折叠 30px → 展开显示内容)、状态栏 28px;底部抽屉折叠时中心图表区 SHALL 吃掉所有剩余空间,四周面板均可折叠/隐藏,折叠后图表全屏铺满。底部抽屉展开时工作区 SHALL 成为纵向滚动容器:中心图表行(含中心图表与右侧面板) SHALL 保留等于折叠态可用高度的最小高度而非被无限压缩,底部抽屉 SHALL 以其目标高度完整呈现,用户 SHALL 可纵向滚动工作区看完整个底部模块。右侧面板 SHALL 随工作区一同滚动且 SHALL NOT 悬停固定;其内部长列表 SHALL 保留自身滚动,滚动到底后滚轮事件 SHALL 自然冒泡至工作区继续滚动。中心图表区 SHALL 呈现**单个** klinecharts-pro 原生终端(自带原生周期栏与左侧绘图栏),不再有多图表网格、唯一活动格或跨格同步。

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

#### Scenario: 折叠态无工作区滚动
- **WHEN** 底部抽屉处于折叠态
- **THEN** 工作区 SHALL NOT 可滚动,布局行为 SHALL 与既有固定四边框布局一致

#### Scenario: 展开态工作区纵向滚动
- **WHEN** 底部抽屉展开
- **THEN** 工作区 SHALL 成为纵向滚动容器,中心图表行 SHALL 保留确定的最小高度,向下滚动 SHALL 呈现完整底部模块

#### Scenario: 右侧面板随工作区滚动
- **WHEN** 底部抽屉展开且用户向下滚动工作区
- **THEN** 右侧面板 SHALL 随工作区一同上移,SHALL NOT 悬停固定覆盖底部模块

#### Scenario: 嵌套滚动链
- **WHEN** 滚轮位于右侧面板内部长列表且该列表已滚动到底
- **THEN** 滚轮事件 SHALL 冒泡至工作区继续纵向滚动,SHALL NOT 卡死在面板内部
