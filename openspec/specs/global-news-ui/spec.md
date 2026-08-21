# global-news-ui Specification

## Purpose
TBD - created by archiving change global-news-feed. Update Purpose after archive.
## Requirements
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

前端 SHALL 通过 EventSource 订阅 `GET /news/stream` 接收实时新闻;断线自动重连后 SHALL 按 `id` 去重,避免 snapshot 回放造成列表重复;新条目到达 SHALL 按最新在前置顶插入,通过滚动锚定与「N条新快讯」胶囊保持阅读位置,而非自动滚动到底部。

#### Scenario: 断线重连防重放

- **WHEN** EventSource 断线并自动重连、收到新一轮 `snapshot`
- **THEN** 列表 SHALL 按 `id` 去重,已在列表中的条目 SHALL 不重复展示

#### Scenario: 自动滚动

- **WHEN** 用户位于列表顶部且收到新 `item` 事件
- **THEN** 新条目 SHALL 自动置顶插入并锚定视口,无需手动滚动到底部;用户已下滚时 SHALL 通过「N条新快讯」胶囊暂存,阅读位置保持不变

#### Scenario: 新条目置顶

- **WHEN** 用户在顶部且收到新 `item` 事件
- **THEN** 新条目 SHALL 置顶插入并锚定视口;用户下滚时 SHALL 进入胶囊暂存

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

### Requirement: 瀑布流布局

全域快讯列表 SHALL 以 JS 瀑布流渲染:每条卡片 SHALL 放入当前高度最短的列;列高度 SHALL 由卡片真实测量(`ResizeObserver`)更新,未挂载卡片 SHALL 以「字数×行高」估算参与列平衡;仅当列高差超过阈值时 SHALL 迁移卡片,避免渲染抖动。

#### Scenario: 初始分布

- **WHEN** 快照携带一批条目
- **THEN** 每条 SHALL 放入估算后最短的列,最新条目分布在顶部一行

#### Scenario: 实测校正

- **WHEN** 卡片挂载并测量出真实高度
- **THEN** 所在列高度 SHALL 更新;列高差超过阈值时 SHALL 将卡片迁移至实际最短列

#### Scenario: 实时插入

- **WHEN** 新条目到达
- **THEN** SHALL 插入当前最短列的顶部,不触发全量重排

### Requirement: 最新置顶与滚动锚定

列表 SHALL 最新在前;自动 flush 新条目时 SHALL 记录视口顶部卡片 `id`,插入完成后按该卡片位移补偿滚动位置,SHALL 保证用户不感知跳动。

#### Scenario: 顶部自动 flush

- **WHEN** 用户在顶部且收到新条目
- **THEN** 新条目 SHALL 置顶插入,视口位置 SHALL 通过锚定补偿保持稳定

#### Scenario: 锚定失效兜底

- **WHEN** 锚点卡片已不在窗口内
- **THEN** SHALL 按插入总高度估算补偿滚动位置

### Requirement: "N条新快讯"胶囊

用户已向下滚动时到达的新条目 SHALL 暂存而不插入,并在顶部浮出「N 条新快讯」胶囊,不打断阅读;点击胶囊 SHALL flush 暂存条目并滚动回顶部。

#### Scenario: 下滚缓冲

- **WHEN** 用户未在顶部且收到新条目
- **THEN** 条目 SHALL 进入暂存队列,展示计数胶囊,列表 SHALL 不滚动、不插入

#### Scenario: 点击胶囊回顶

- **WHEN** 用户点击胶囊
- **THEN** SHALL 将暂存条目置顶插入、滚动回顶部并清除胶囊

#### Scenario: 手动回顶自动 flush

- **WHEN** 用户自行滚动回顶部
- **THEN** 暂存条目 SHALL 自动 flush,无需点击胶囊

### Requirement: 完整内容竖型卡片

每条新闻 SHALL 以竖型卡片展示完整内容,包括来源徽标、分类徽标、标题、**完整正文**(不得截断)、时间与原文外链(当 `url` 存在时)。

#### Scenario: 完整正文

- **WHEN** 卡片渲染条目正文
- **THEN** 正文 SHALL 完整展示,不得使用行数截断(如 `line-clamp`)

#### Scenario: 卡片要素

- **WHEN** 列表渲染一条新闻
- **THEN** 卡片 SHALL 展示来源徽标、分类徽标、标题、正文、时间,且 `url` 非空时提供原文外链

### Requirement: 窗口化渲染与加载更早

面板 SHALL 仅挂载最新 `NEWS_WINDOW_SIZE`(默认 100)条卡片;列表底部 SHALL 设 IntersectionObserver 哨兵,哨兵进入视口时 SHALL 再放行一批旧条目;哨兵失效时 SHALL 提供「加载更早」按钮兜底。

#### Scenario: 窗口限制

- **WHEN** 条目数超过窗口大小
- **THEN** 仅最新窗口内条目 SHALL 挂载到 DOM

#### Scenario: 滚动放行

- **WHEN** 底部哨兵进入视口
- **THEN** SHALL 追加放行下一批旧条目

#### Scenario: 兜底按钮

- **WHEN** 哨兵失效或未触发滚动
- **THEN** SHALL 展示「加载更早」按钮,点击 SHALL 放行下一批旧条目

#### Scenario: 缓冲耗尽

- **WHEN** 已放行到环形缓冲边界且无更多条目
- **THEN** SHALL 展示「已加载全部」,不再请求

### Requirement: 单一滚动容器

全域快讯列表 SHALL 跟随页面级滚动,不得在面板内嵌套独立的 `overflow-y-auto` 滚动盒。

#### Scenario: 无嵌套滚动

- **WHEN** 渲染全域快讯面板
- **THEN** 列表 SHALL 在页面滚动容器内完整展开,不产生内嵌滚动条

