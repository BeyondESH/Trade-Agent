## ADDED Requirements

### Requirement: FastAPI 应用骨架与本地绑定

系统 SHALL 提供可创建的 FastAPI 应用(应用工厂),默认绑定 127.0.0.1,提供健康检查与 OpenAPI 文档,并对异常返回统一 JSON 错误。

#### Scenario: 健康检查

- **WHEN** 请求 `GET /health`
- **THEN** 系统 SHALL 返回 200 与状态信息

#### Scenario: 统一错误响应

- **WHEN** 某端点因非法参数失败
- **THEN** 系统 SHALL 返回带错误信息的 JSON 与合适的状态码(非 500 未处理异常)
