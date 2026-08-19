## ADDED Requirements

### Requirement: v3 深历史回灌通道

系统 SHALL 通过 Bitget v3 `/api/v3/market/history-candles` 公共 REST 端点提供无限深度历史回灌能力，作为深度回灌的 REST 主通道。该通道 MUST 支持对全部受支持且提供历史查询的时间级别向更早方向分页回溯至交易所真实最早历史（不受近端窗口深度限制）。单次请求 limit SHALL 不超过 100 根，单次 startTime/endTime 区间 SHALL 不超过 90 天，并 MUST 遵守交易所频控（20 req/s）约束。

#### Scenario: v3 端点为深度回灌主通道

- **WHEN** 系统执行深度历史回灌
- **THEN** 系统 SHALL 使用 v3 history-candles 端点获取历史
- **AND** 对 1m/5m/15m/1h/4h/1d 等受支持周期均能向更早方向分页回溯

#### Scenario: endTime cursor 向前翻页

- **WHEN** 某页返回后仍有更早历史需要获取
- **THEN** 系统 SHALL 以该页最旧 bar 的 open_time 前移 endTime cursor 继续请求
- **AND** 翻页 MUST 不产生时间缺口

#### Scenario: 单次区间超过 90 天时受限

- **WHEN** 请求区间跨度超过 90 天
- **THEN** 系统 SHALL 分页/分段拉取以不超过 90 天单次区间
- **AND** MUST NOT 因超限请求返回错误而中断回灌

#### Scenario: v3 请求失败时回退

- **WHEN** v3 请求持续失败（网络/非频控错误）
- **THEN** 系统 SHALL 回退到既有通道（v2 candles / MCP）尽力返回数据
- **AND** 不抛出未处理异常中断前端加载

### Requirement: 深度上限与 earliest_reached 解耦

系统 MUST 区分「渠道历史深度上限」与「交易所真实最早历史」：当某分页渠道因近端窗口深度限制返回空页时，不得将其判定为已到交易所最早历史，而 MUST 切换/继续通过可无限回溯的通道探测真实边界。`earliest_reached` 判定 SHALL 仅当可无限回溯通道（v3）对最旧窗口返回空页（重试一次后）才成立。

#### Scenario: v2 深度上限不触发 earliest

- **WHEN** v2 candles 通道在某时间点因深度上限返回空页
- **THEN** 系统 SHALL 通过 v3 通道继续向更早方向探测
- **AND** MUST NOT 将 v2 空页判定为已到交易所最早历史

#### Scenario: v3 空页判定 earliest

- **WHEN** v3 通道对最旧窗口返回空页且重试一次后仍为空
- **THEN** 系统 SHALL 判定已到交易所真实最早历史
- **AND** 停止继续回灌并向前端标识"已到最早"
