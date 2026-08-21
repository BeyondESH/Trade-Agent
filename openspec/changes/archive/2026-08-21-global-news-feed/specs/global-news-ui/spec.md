## ADDED Requirements

### Requirement: 全域快讯入口

`NewsCalendarView` SHALL 新增第三个顶层 segment「全域快讯」,与现有「Market News Wire」「Economic Calendar」并列;BlockBeats 的 REST 分页数据流(`newsfeed.ts` / 各类型 chips)SHALL 保持不动。

#### Scenario: 切换 segment

- **WHEN** 用户点击「全域快讯」
- **THEN** SHALL 渲染全域快讯面板(主题 chips + SSE 滚动列表),不再渲染 BlockBeats 类型 chips

#### Scenario: BlockBeats 不受影响

- **WHEN** 用户切换到「Market News Wire」
- **THEN** SHALL 展示原有 BlockBeats 10 类型 chips 与分页列表,行为与现状完全一致

### Requirement: 主题分类筛选

全域快讯面板 SHALL 从 `GET /news/categories` 拉取分类列表渲染主题 chips,支持单选过滤与「全部」默认项;chips 顺序 SHALL 与后端返回一致。

#### Scenario: 分类 chips 动态渲染

- **WHEN** 面板加载且 `/news/categories` 返回分类列表
- **THEN** SHALL 按后端顺序渲染「全部」+ 各分类 chips

#### Scenario: 单选过滤

- **WHEN** 用户点击某分类 chip
- **THEN** 列表 SHALL 仅显示该分类条目;点击「全部」SHALL 恢复显示全部条目

### Requirement: SSE 滚动推送与防重放

前端 SHALL 通过 EventSource 订阅 `GET /news/stream` 接收实时新闻;断线自动重连后 SHALL 按 `id` 去重,避免 snapshot 回放造成列表重复;新条目到达 SHALL 支持自动滚动(可开关)。

#### Scenario: 断线重连防重放

- **WHEN** EventSource 断线并自动重连、收到新一轮 `snapshot`
- **THEN** 列表 SHALL 按 `id` 去重,已在列表中的条目 SHALL 不重复展示

#### Scenario: 自动滚动

- **WHEN** 自动滚动开启且收到新 `item` 事件
- **THEN** 列表 SHALL 滚动至最新条目;关闭时 SHALL 停留在当前位置

### Requirement: 条目展示

每条新闻 SHALL 展示来源徽标(`em`/`sina`/`ths`/`cls`)、分类徽标、标题、内容摘要与时间;条目含 `url` 时 SHALL 提供外链。

#### Scenario: 条目卡片

- **WHEN** 列表渲染一条新闻
- **THEN** 卡片 SHALL 展示来源徽标、分类徽标、标题、摘要与时间

#### Scenario: 外链

- **WHEN** 条目 `url` 非空
- **THEN** SHALL 提供「原文」外链,新窗口打开

### Requirement: 优雅降级

当后端 `GET /news/stream` 或 akshare 来源不可用时,面板 SHALL 展示可见的不可用提示与连接状态,而非空白或报错崩溃。

#### Scenario: 不可用状态

- **WHEN** SSE 连接建立但状态帧标识来源不可用
- **THEN** 面板 SHALL 展示不可用提示与连接状态,保持界面可用
