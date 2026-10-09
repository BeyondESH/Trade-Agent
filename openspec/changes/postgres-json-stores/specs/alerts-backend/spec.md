## MODIFIED Requirements

### Requirement: 后端警报持久化

系统 SHALL 在后端实现 `/alerts` 端点：`GET` 列表、`POST` 创建、`PUT`/`DELETE` 更新与删除，数据持久化到 PostgreSQL `alerts` 表（连接串来自 `MD_POSTGRES_DSN`）。同一用户的警报 SHALL 跨设备/会话保持。列表 SHALL 按 `seq DESC` 返回（最新在前），字段形状与前端 `Alert` 类型一致。

#### Scenario: 创建并列出

- **WHEN** `POST /alerts` 创建一条警报后 `GET /alerts`
- **THEN** 列表 SHALL 包含该警报且字段完整（品种、条件、阈值、启用、触发态）

#### Scenario: 更新与删除

- **WHEN** `PUT /alerts/{id}` 修改阈值或 `DELETE /alerts/{id}`
- **THEN** 后续 `GET` SHALL 反映修改/移除

#### Scenario: 跨会话保持

- **WHEN** 重启服务后 `GET /alerts`
- **THEN** 之前创建的警报 SHALL 仍存在
