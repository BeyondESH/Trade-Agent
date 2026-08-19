## ADDED Requirements

### Requirement: 服务端数据缓存
系统 SHALL 为 BlockBeats data 端点提供服务端缓存：后端 SHALL 定时从 BlockBeats data 端点抓取数据并持久化到本地缓存，前端请求 `GET /blockbeats/data/{endpoint}` 时 SHALL 优先返回本地缓存数据；仅当缓存未命中时才回退实时转发上游。该机制对前端透明，`/api/blockbeats/*` 消费方无需改动。

#### Scenario: 缓存命中直接返回
- **WHEN** `GET /blockbeats/data/btc_etf` 且本地存在对应缓存
- **THEN** 后端 SHALL 直接返回缓存中的 `data`，不请求上游
- **AND** 响应 SHALL 携带 `from_cache: true` 与 `fetched_at` 时间戳

#### Scenario: 缓存未命中回退实时
- **WHEN** `GET /blockbeats/data/{endpoint}` 且本地无对应缓存（如未预热的参数组合）
- **THEN** 后端 SHALL 实时转发上游请求并返回数据
- **AND** 响应 SHALL 携带 `from_cache: false`

#### Scenario: 前端消费方不受影响
- **WHEN** 前端通过 `/api/blockbeats/*` 请求数据（无论命中缓存与否）
- **THEN** 响应的 `data` 结构与从前一致，前端无需解析新增字段

