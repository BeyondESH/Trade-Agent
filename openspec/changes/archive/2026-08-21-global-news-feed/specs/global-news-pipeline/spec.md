## ADDED Requirements

### Requirement: AKShare 多源抓取与归一化

系统 SHALL 通过 AKShare 实时抓取东财全球财经快讯(`stock_info_global_em`)、新浪全球财经快讯(`stock_info_global_sina`)、同花顺全球财经直播(`stock_info_global_ths`)、财联社电报(`stock_telegraph_cls`)4 个来源,并将各来源列名归一化为统一条目结构 `{id, source, title, content, url, ts, category}`。

#### Scenario: 四源归一化

- **WHEN** 轮询线程抓取任一来源的 DataFrame
- **THEN** 返回条目 SHALL 归一化到统一 schema,`source` 取 `em`/`sina`/`ths`/`cls`,`ts` SHALL 为 epoch 秒

#### Scenario: id 稳定性

- **WHEN** 同一内容被多轮抓取重复获取
- **THEN** `id` SHALL 保持不变(基于 `source + content` 哈希生成),无需维护去重状态

#### Scenario: 单源失败隔离

- **WHEN** 某来源请求失败或返回空数据
- **THEN** 其余来源 SHALL 继续抓取并推送,失败 SHALL 仅记录日志且不影响其他来源

### Requirement: 主题分类

系统 SHALL 按有序关键词规则对每条新闻分类,首条命中即定主题,未命中归入 `other`;分类列表 SHALL 通过 `GET /news/categories` 暴露,顺序为 `crypto`/`macro`/`policy`/`a-share`/`global-market`/`industry`/`company`,关键词规则基于标题与内容合并文本。

#### Scenario: 命中分类

- **WHEN** 新闻文本含 `比特币` 或 `美联储` 等高优先级关键词
- **THEN** 该新闻 `category` SHALL 归类为对应主题(`crypto`/`macro`),且高优先级分类优先于低优先级

#### Scenario: 未命中回退

- **WHEN** 新闻文本不匹配任何分类关键词
- **THEN** `category` SHALL 为 `other`

#### Scenario: 分类列表端点

- **WHEN** 前端请求 `GET /news/categories`
- **THEN** 后端 SHALL 返回有序分类列表,供前端动态渲染 chips

### Requirement: 专用轮询线程

系统 SHALL 运行一个独立于事件循环的后台线程,按 `MD_NEWS_POLL_SECONDS`(默认 60 秒)轮询所有来源;`akshare` 库 SHALL 在该线程内懒加载,不拖慢 uvicorn 启动;某来源连续失败 SHALL 触发退避(逐次翻倍,封顶 5 倍轮询间隔)。

#### Scenario: 独立线程轮询

- **WHEN** uvicorn 启动(lifespan)
- **THEN** SHALL 启动后台轮询线程,按配置间隔周期性抓取;应用关闭时 SHALL 停止该线程

#### Scenario: akshare 懒加载

- **WHEN** 应用启动
- **THEN** SHALL 不在启动路径导入 `akshare`,仅在轮询线程首次抓取时导入

#### Scenario: 失败退避

- **WHEN** 某来源连续抓取失败
- **THEN** 该来源 SHALL 按退避策略降低抓取频率,避免对不可用上游热循环

### Requirement: SSE 实时推送

系统 SHALL 提供 `GET /news/stream` 以 Server-Sent Events 推送新闻:连接建立时先发送 `snapshot` 事件(缓冲区最近条目),随后每抓取到新条目发送 `item` 事件;SHALL 每 15 秒发送心跳注释帧保持连接;akshare 全部来源不可用时 SHALL 仍允许建立连接并发送状态帧,供前端展示不可用状态。

#### Scenario: 连接回放

- **WHEN** 客户端建立 `/news/stream` 连接
- **THEN** 服务端 SHALL 先发送 `snapshot` 事件,携带缓冲区最近条目(含历史已抓取内容)

#### Scenario: 实时推送

- **WHEN** 轮询线程抓取到新条目
- **THEN** 服务端 SHALL 通过 `item` 事件逐条推送给所有已连接客户端

#### Scenario: 心跳保活

- **WHEN** 连接空闲超过 15 秒
- **THEN** 服务端 SHALL 发送心跳注释帧,防止代理/网关中断长连接

#### Scenario: 来源不可用优雅降级

- **WHEN** akshare 全部来源抓取失败
- **THEN** `/news/stream` SHALL 仍可连接,发送状态帧标识来源不可用,而非断连或报错

### Requirement: /news/context 查询

系统 SHALL 提供 `GET /news/context` 从缓冲区查询新闻:`hours` 参数按时间过滤(`ts` 距今窗口),`category` 参数按逗号分隔分类列表过滤;返回结构化 `{items: [...]}` 供后续 AI Agent 消费。

#### Scenario: 时间过滤

- **WHEN** 请求 `/news/context?hours=2`
- **THEN** 返回条目 SHALL 仅含 `ts` 在最近 2 小时内的新闻

#### Scenario: 分类过滤

- **WHEN** 请求 `/news/context?category=macro,crypto`
- **THEN** 返回条目 SHALL 仅含 `category` 为 `macro` 或 `crypto` 的新闻

#### Scenario: 无过滤参数

- **WHEN** 请求 `/news/context` 不带参数
- **THEN** SHALL 返回缓冲区全部条目,并附 `generated_at` 时间戳
