## Why

路线图(`ai-trading-system-roadmap`)定义了双大脑系统——DL 量化(5m 级)与 AI Agent(日线级)——但 `web-frontend` change 只交付了行情图表界面,**没有落地 AI Agent 专属页面**。后端能力(`/agent/decide`、`/agent/cycle`、`/backtest`、`/portfolio`、`/journal`、`/config`)与前端 API 封装(`api.agentDecide` 等)均已就绪,缺的只是消费它们的 UI。用户需要一个集中入口:Tab1 传统数据深度学习量化工作台(喂数据盘跑因子、回测、看曲线),Tab2 AI Agent 行情分析界面(决策/循环/组合/日志)。

## What Changes

- 新增 `agent` 视图类型,接入桌面外壳(`DesktopViewMode`、`GlobalNavRail`、`App.tsx` 工作区路由、`handleNewTab` 标题映射、命令面板),与现有 chart/markets/screener 等并列。
- 新增 `AgentView` 页面,内含两个 Tab:
  - **Tab1 DL 量化工作台**:标的/周期选择(1m/1h/4h/1d)、数据可用性提示(bar 数/日期范围)、训练参数(train_ratio/threshold/fee/slippage)、跑回测 → 指标卡 + 权益/回撤 SVG 曲线、因子管理(目录 + 自定义表达式)、因子 IC 排序表。
  - **Tab2 Agent 行情分析**:决策(只出建议)、纸面循环(记忆增强 + 风控执行)、组合/日志、Provider/风控/System Prompt/手动规则配置。
- **BREAKING**: 无。`run_pipeline(df)` 缺省行为与现状完全一致(默认 7 因子),现有测试与 L2 端点不受影响。
- 后端:
  - `dlquant.py`:`backtest()`/`run_pipeline()` 额外返回权益曲线、回撤曲线、逐 bar 信号与预测概率序列(对齐测试段时间戳);`build_features()` 支持可配置因子集(缺省 = 现 7 因子)。
  - 新端点 `POST /dl/features`:返回各因子的 IC/IC_abs/均值/标准差/覆盖率/末行值,供因子工作台排序。
  - `/backtest` body 扩展:可选 `factors` + 训练参数(向后兼容,缺省走默认)。
  - 因子配置持久化到 `config.json`(经 `/config`),前端因子管理面板读写。
  - `indicators.py` 扩充因子目录(RSI/ATR/成交量类等),并提供白名单表达式求值器(禁 `__`/import/方法链)。

## Capabilities

### New Capabilities
- `ai-agent-page`: 桌面外壳集成——`agent` 视图类型、导航入口、双 Tab 页面骨架与共享标的/周期状态。
- `dl-quant-workbench`: Tab1 前端——数据可用性提示、回测运行、指标卡、权益/回撤 SVG 曲线、训练参数控件。
- `factor-workbench`: 可配置因子体系——预设目录 + 白名单表达式 DSL、`build_features` 因子化重构、IC 分析端点、配置持久化、前端因子管理面板。
- `agent-analysis-ui`: Tab2 前端——决策/循环/组合/日志/配置面板。

### Modified Capabilities
- `feature-engineering`: 特征构造从固定 7 因子改为可配置因子集(缺省兼容),并新增自定义表达式白名单安全要求。
- `backtest-engine`: 回测输出从标量指标扩展为含权益/回撤/信号/概率序列;回测与训练接受参数化输入。

## Impact

- **后端**: `backend/src/market_data/{dlquant,indicators,webapi,config,appconfig}.py`;新增表达式求值器模块;`backend/tests` 增补 dlquant 因子化/曲线序列测试。
- **前端**: `frontend/src/{types/trading.ts, api/client.ts, api/types.ts, components/desktop/GlobalNavRail.tsx, App.tsx}`;新增 `components/views/AgentView.tsx` 及其子组件。
- **API**: `/backtest` body 向后兼容扩展;新增 `POST /dl/features`;`/config` 数据结构增加 `factors` 段(兼容读取旧配置)。
- **依赖**: 无新增。曲线渲染用内联 SVG(沿用 MarketsView Sparkline 先例);表达式求值用纯 Python 白名单实现。
- **数据**: 5m 数据盘稀疏(仅 8 个文件),1h/4h/1d 稠密;页面按用户所选周期展示数据可用性,不强制回填。
