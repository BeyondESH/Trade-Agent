# blockbeats-news Specification

## Purpose
TBD - created by archiving change frontend-tv-rebuild. Update Purpose after archive.
## Requirements
### Requirement: BlockBeats 快讯接入
系统 SHALL 通过后端代理接入 BlockBeats 快讯 API(`api-pro.theblockbeats.info`),后端新增 `GET /api/blockbeats/newsflash/{type}` 代理路由,API key 从后端配置读取(`BB_API_KEY`,支持 `backend/.env` 配置),key SHALL 永不暴露给浏览器。前端只调用自家 `/api/blockbeats/newsflash/*`。

#### Scenario: 代理转发
- **WHEN** 前端请求 `/api/blockbeats/newsflash/important`
- **THEN** 后端 SHALL 携带 `api-key` 头转发到 `https://api-pro.theblockbeats.info/v1/newsflash/important`,并返回规范化结果

#### Scenario: Key 不落地浏览器
- **WHEN** 前端发起任何 BlockBeats 请求
- **THEN** 请求 SHALL 只含后端路径,不含 `api-key` 头,`BB_API_KEY` 只存在于后端环境

#### Scenario: 配置即生效
- **WHEN** 用户在 `backend/.env` 配置 `BB_API_KEY=<key>` 并启动后端
- **THEN** SHALL 从配置加载链读取该 key,无需额外环境变量注入,代理即可正常转发

#### Scenario: 未配置时可见错误
- **WHEN** 未配置 `BB_API_KEY` 且前端请求 newsflash
- **THEN** 后端 SHALL 返回 `400 {"detail":"BB_API_KEY is not set"}`,前端 News 视图 SHALL 显示可见的配置错误提示,而非静默展示空列表

### Requirement: News Wire 全 10 类接口
系统 SHALL 将 News Wire 的筛选 tab 改为一一对应 BlockBeats 全部 10 个快讯端点:`all`(`/newsflash`)、`24h`(`/24h`)、`important`、`original`、`first`、`onchain`、`financing`、`prediction`、`ai`、`stock`;不再使用模板原有的 `Crypto/Stocks/Macro/Forex` 分类。

#### Scenario: 全部接口可选
- **WHEN** 用户打开 News Wire
- **THEN** SHALL 显示 10 个分类 tab(含 all 与 24h),每类对应一个 API 端点

#### Scenario: 分类筛选生效
- **WHEN** 用户点击 `financing` 分类
- **THEN** SHALL 请求 `/api/blockbeats/newsflash/financing` 并仅展示融资类快讯

### Requirement: 快讯字段映射
系统 SHALL 将 BlockBeats 响应映射为模板 NewsItem 结构:`title`→标题、`content`(HTML)→summary(剥标签取纯文本)、`create_time`→time、`link`/`url`→"Full Article"外链、`pic`→封面图;`create_time` 解析 SHALL 兼容 `"Y-m-d H:i:s"` 与 epoch 秒两种格式。

#### Scenario: HTML 内容剥离
- **WHEN** 收到含 `<p><a>` 标签的 `content`
- **THEN** SHALL 在卡片 summary 中展示纯文本,HTML 标签被移除

#### Scenario: 时间格式兼容
- **WHEN** `create_time` 为 `"2026-01-29 14:32:37"` 或 `1769677313`
- **THEN** SHALL 都正确解析并显示为可读时间

