# history-backfill Specification

## Purpose
TBD - created by archiving change bitget-connectivity. Update Purpose after archive.
## Requirements
### Requirement: 按需越界历史回灌

系统 SHALL 支持当用户向图表左侧翻页越过本地已存最早 bar 时，按需触发对应 symbol/timeframe/category 的历史深度回灌：后端向后分页拉取更早区间并落库，随后 `/candles` MUST 能连续返回这些更早区间的数据。

#### Scenario: 翻页越界触发回灌

- **WHEN** 用户向左翻页请求早于本地最早 bar 的历史区间
- **THEN** 系统 SHALL 触发后端拉取该区间之前的更早 K 线并落库
- **AND** 回灌完成后 `/candles` SHALL 返回可继续向前连续拼接的数据

#### Scenario: 回灌不重复已存数据

- **WHEN** 请求的区间部分已存在于本地
- **THEN** 系统 SHALL 仅拉取缺失的更早区间
- **AND** 不重复拉取已存数据

#### Scenario: 无更多历史时的终止

- **WHEN** 交易所已无更早历史可返回
- **THEN** 系统 SHALL 停止继续回灌并向前端标识"已到最早"，不进入无限循环

### Requirement: 当前 symbol 后台预取

系统 SHALL 在用户选定某 symbol 后，于后台对该 symbol 的当前周期预取一定深度的历史，使常规翻页无需等待即可连续滚动。

#### Scenario: 选定后启动后台预取

- **WHEN** 用户切换到某个 symbol
- **THEN** 系统 SHALL 在后台对其当前周期预取额外历史深度
- **AND** 预取 SHALL 受节流约束以尊重交易所频控

#### Scenario: 预取与按需回灌协同

- **WHEN** 后台预取尚未完成而用户已翻页越界
- **THEN** 系统 SHALL 复用/合并同一区间的拉取，避免对同一区间重复请求

### Requirement: 回灌节流与频控保护

系统 SHALL 对历史回灌与预取施加节流/限并发，避免触发 Bitget REST/MCP 频控导致失败或封禁。

#### Scenario: 触发频控时退避

- **WHEN** 回灌过程中遭遇交易所频控错误
- **THEN** 系统 SHALL 退避后重试，且不丢失已拉取的分页进度

