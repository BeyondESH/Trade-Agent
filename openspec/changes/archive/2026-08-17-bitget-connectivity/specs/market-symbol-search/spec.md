## MODIFIED Requirements

### Requirement: 全市场符号检索

系统 SHALL 支持在 K 线图与市场列表中检索 Bitget 全产品线的符号，检索结果基于后端 `/instruments` 动态生成，而非硬编码固定列表。symbol 的唯一标识 MUST 为 `category:instId` 复合键，而非仅 `instId`；当同一 `instId` 存在于多个品类（如 SPOT 与 USDT-FUTURES 的 `BTCUSDT`）时，系统 MUST 保留其为相互独立的可选项，并按所选项的 `category` 与其价格/数量精度解析，不得静默取首个匹配。前端符号搜索 MUST 收敛为基于 `/instruments` 的单一入口，价格/数量精度一律取自 instrument，不得回退到硬编码默认值。

#### Scenario: 检索真实市场符号

- **WHEN** 用户在 K 线图搜索框输入关键词
- **THEN** SHALL 返回全产品线中 symbol 或短名匹配的交易对（含现货、各品类合约、贵金属、股票），且可选对应资产

#### Scenario: 按品类过滤

- **WHEN** 用户在指定品类（如现货）内搜索
- **THEN** SHALL 仅返回该品类的匹配结果

#### Scenario: 精度元数据随结果返回

- **WHEN** 检索结果返回某个 symbol
- **THEN** SHALL 携带该 symbol 的类别与价格/数量精度，供图表正确渲染
- **AND** 精度值 SHALL 取自该 instrument，不得回退到硬编码默认精度

#### Scenario: 结果可加载到图表

- **WHEN** 用户选中搜索结果
- **THEN** K 线图 SHALL 以所选 symbol 的品类加载 K 线并联动订单簿/成交/资金费率

#### Scenario: 跨品类同名符号消歧

- **WHEN** 同一 `instId`（如 `BTCUSDT`）同时存在于多个品类
- **THEN** 系统 SHALL 以 `category:instId` 区分为独立可选项
- **AND** 选中某一项后 SHALL 按其品类加载数据并采用其对应价格/数量精度，不得取首个匹配

#### Scenario: 单一搜索入口

- **WHEN** 用户在顶栏或图表中检索符号
- **THEN** 系统 SHALL 使用统一的、基于 `/instruments` 的检索路径
- **AND** 顶栏搜索与图表 datafeed 搜索 SHALL NOT 使用互相不一致的两条数据来源
