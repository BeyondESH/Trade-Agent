## MODIFIED Requirements

### Requirement: 交易面板

系统 SHALL 在交易面板 tab 展示 `GET /portfolio` 持仓/账户摘要与 `POST /order` 下单表单（沿用现有接口，不改后端）；下单结果与持仓 SHALL 刷新展示，空持仓 SHALL 显示空态。交易面板 SHALL 同时提供可用的「Trade History」子 tab，经 `GET /journal` 拉取并展示持久化交易记录（品种 / 方向 / 开仓价 / 平仓价 / 盈亏 / 平仓原因，未平仓或缺失字段以占位符显示）；进入该子 tab SHALL 触发拉取并展示加载态，记录为空时 SHALL 显示空态，请求失败时 SHALL 显示错误信息而非空白面板；该视图 MUST 为只读，MUST NOT 修改订单或持仓。

#### Scenario: 持仓与下单

- **WHEN** 打开交易面板并提交订单
- **THEN** SHALL 展示账户摘要与持仓列表，下单后 SHALL 刷新持仓；无持仓时显示空态

#### Scenario: 交易历史渲染

- **WHEN** 用户切换到 Trade History 子 tab 且 `GET /journal` 返回交易记录
- **THEN** SHALL 以表格渲染每条记录的品种 / 方向 / 开仓价 / 平仓价 / 盈亏 / 平仓原因
- **AND** `exit_price`/`pnl` 等缺失字段 SHALL 以占位符显示

#### Scenario: 交易历史空态

- **WHEN** `GET /journal` 返回空记录集
- **THEN** SHALL 显示「暂无交易历史」空态文案，而非空白面板

#### Scenario: 交易历史加载与错误态

- **WHEN** 正在拉取交易历史或拉取失败
- **THEN** SHALL 分别显示加载态或错误信息，且交易面板其余子 tab SHALL 保持可用

#### Scenario: 交易历史只读

- **WHEN** 用户查看 Trade History 子 tab
- **THEN** SHALL NOT 产生任何下单、撤单或平仓操作，MUST NOT 修改本地模拟账户与挂单
