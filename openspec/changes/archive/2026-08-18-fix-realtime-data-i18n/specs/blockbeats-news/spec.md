## MODIFIED Requirements

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
