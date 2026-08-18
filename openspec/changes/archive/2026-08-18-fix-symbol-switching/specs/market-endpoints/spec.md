## ADDED Requirements

### Requirement: 实时缓存 K 线端点

系统 SHALL 提供读取实时流缓存 K 线的端点 `GET /candles/recent`，返回与 `/candles` 相同的数据形状。

#### Scenario: 读取实时缓存 K 线

- **WHEN** 请求某 series 的 `candles/recent`
- **THEN** 系统 SHALL 返回该 series 最近 N 根 OHLCV（无数据返回空列表）
