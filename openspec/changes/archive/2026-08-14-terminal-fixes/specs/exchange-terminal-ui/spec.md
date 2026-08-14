## MODIFIED Requirements

### Requirement: 顶部导航与行情条

系统 SHALL 在顶部提供导航区与横向滚动行情条：导航含产品 Tab（现货/合约）与连接状态；导航左端 SHALL 显示品牌名 `RaiBro Trading`；行情条逐项展示 symbol、最新价、24h 涨跌幅，价格与涨跌用红绿 tokens 着色。

#### Scenario: 品牌名显示

- **WHEN** 前端加载终端页面
- **THEN** 顶部导航左端 SHALL 显示 `RaiBro Trading`

#### Scenario: 行情条实时更新

- **WHEN** ticker 频道推送更新
- **THEN** 行情条 SHALL 更新对应 symbol 的最新价与涨跌幅并保持滚动位置

#### Scenario: 涨跌着色一致

- **WHEN** 行情条展示价格或涨跌幅
- **THEN** 上涨 SHALL 用绿色 token、下跌用红色 token，与设计系统一致
