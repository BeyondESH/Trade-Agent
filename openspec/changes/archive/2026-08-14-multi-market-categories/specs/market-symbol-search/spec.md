## ADDED Requirements

### Requirement: 全市场符号检索

系统 SHALL 支持在 K 线图与市场列表中检索 Bitget 全产品线的符号，检索结果基于后端 `/instruments` 动态生成，而非硬编码固定列表。

#### Scenario: 检索真实市场符号

- **WHEN** 用户在 K 线图搜索框输入关键词
- **THEN** SHALL 返回全产品线中 symbol 或短名匹配的交易对（含现货、各品类合约、贵金属、股票），且可选对应资产

#### Scenario: 按品类过滤

- **WHEN** 用户在指定品类（如现货）内搜索
- **THEN** SHALL 仅返回该品类的匹配结果

#### Scenario: 精度元数据随结果返回

- **WHEN** 检索结果返回某个 symbol
- **THEN** SHALL 携带该 symbol 的类别与价格/数量精度，供图表正确渲染

#### Scenario: 结果可加载到图表

- **WHEN** 用户选中搜索结果
- **THEN** K 线图 SHALL 以所选 symbol 的品类加载 K 线并联动订单簿/成交/资金费率
