# config-persistence Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 配置读写与持久化

系统 SHALL 提供 provider/risk 参数、系统提示与手动规则的读写端点,并持久化到本地 JSON。写入 MUST 校验取值(复用配置构造校验),非法则拒绝。

#### Scenario: 读取配置

- **WHEN** 请求 `GET /config`
- **THEN** 系统 SHALL 返回 provider、risk、system_prompt、manual_rules

#### Scenario: 更新并持久化

- **WHEN** 以合法值 `PUT /config`
- **THEN** 系统 SHALL 持久化并在重新读取时返回新值

#### Scenario: 非法配置被拒

- **WHEN** 提交越界参数(如保证金比例 >1)
- **THEN** 系统 SHALL 拒绝并返回错误,不写入

