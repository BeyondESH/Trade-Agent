## ADDED Requirements

### Requirement: 浏览器环境渲染验证

系统 SHALL 在真实浏览器环境中渲染 K 线图表（蜡烛、指标副图、图层叠加、实时更新），而非仅依赖打桩测试。

#### Scenario: 浏览器渲染 K 线

- **WHEN** 后端与前端运行且提供 candles 数据
- **THEN** 浏览器中 SHALL 显示 K 线蜡烛

#### Scenario: 指标副图与图层渲染

- **WHEN** 图表加载完成
- **THEN** 浏览器中 SHALL 显示配置的指标副图（如 VOL/MACD）与开启的图层（S/R/结构/SMC）
