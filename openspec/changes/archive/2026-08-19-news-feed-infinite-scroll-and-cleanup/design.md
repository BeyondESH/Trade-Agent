# Design: News Feed Infinite Scroll And Cleanup

## Context

新闻数据链路：前端 `newsfeed.ts: fetchNewsflash(type)` → `api.blockbeatsNews(type, 1, 20, "cn")` → 后端 `/blockbeats/newsflash/{type}?page=&size=`（原样透传）→ BlockBeats 上游分页接口。当前前端写死 `page=1, size=20`，只渲染第一页，无翻页。

界面中 BlockBeats 字样分布：`NewsCalendarView.tsx`（标题 line 64、副标题 line 67、每条新闻的 source 标签 line 141）、`i18n.ts`（2 条 key）、`MarketsView.tsx`（副标题）、`DataWindowPanel.tsx`（"Market Pulse (BlockBeats)"）。新闻来源标签的数据字段由 `toNewsItem` 置为 `"BlockBeats"`。

用户决策：不显示 BlockBeats 来源标识；保留外部链接；新闻界面自动无限滚动加载全量；累积渲染全部新闻（数百条）不做虚拟化。

## Goals / Non-Goals

**Goals:**
- 新闻界面滚动到底自动加载下一页，24h 全部新闻可全部查看。
- 界面所有可见 BlockBeats 字样移除，外链保留。

**Non-Goals:**
- 不虚拟化长列表（数百条直接渲染，用户已接受）。
- 不改为后端聚合翻页（保持后端透传，分页逻辑放前端）。
- 不动数据层 `source` 字段与测试断言（数据契约不变）。

## Decisions

### D1: fetchNewsflash 分页化

```ts
export interface NewsflashPage {
  items: NewsItem[];
  page: number;
  hasMore: boolean;
}

export async function fetchNewsflashPage(
  type: NewsflashType,
  page: number = 1,
  size: number = 20,
): Promise<NewsflashPage> {
  const res = await api.blockbeatsNews(type, page, size, "cn");
  const rows = res.data ?? [];
  return { items: rows.map(toNewsItem), page, hasMore: rows.length >= size };
}
```

- 保留 `fetchNewsflash(type)` 作为首屏封装（返回 `NewsItem[]`），旧调用方（NewsPanel 首屏）零改动；新调用方用 `fetchNewsflashPage`。
- `hasMore` 用「返回条数 >= size」近似（末页少于 size 即视为到底；最后一页恰好满 size 时会多请求一次空页，由前端空页去重兜底停止）。
- **备选**：只改 `fetchNewsflash` 返回对象并更新全部调用方——侵入面大，无必要，放弃。

### D2: 新闻界面无限滚动

`NewsCalendarView`：
- 状态：`news: NewsItem[]`、`page: number`、`loadingMore: boolean`、`hasMore: boolean`。
- 滚动监听：新闻列表容器 `onScroll`，当 `scrollTop + clientHeight >= scrollHeight - 120` 且 `hasMore && !loadingMore` 时加载下一页。
- 追加去重：`setNews(prev => { const seen = new Set(prev.map(n => n.id)); return [...prev, ...rows.filter(n => !seen.has(n.id))]; })`。
- 切换分类 `newsType` 时重置 page=1、清空列表、重新拉取。
- 空页处理：`rows.length === 0` 时置 `hasMore=false`。
- 末尾显示加载态/「已加载全部」占位。

**备选**：IntersectionObserver 哨兵元素——同等效果，代码略多；容器 `onScroll` 更贴合现有结构，选择 onScroll。

### D3: NewsPanel 保持首屏

侧栏 `NewsPanel` 复用 `fetchNewsflash`（首屏 20 条）不变，仅做来源标签清理。侧栏空间有限、非主诉求，不做无限滚动。

### D4: BlockBeats 字样清理

- `NewsCalendarView`：主标题/副标题改用去品牌 i18n key；删除每条新闻卡片的 `<span>{n.source}</span>`（来源标签）；Full Article 外链保留。
- `i18n.ts`：
  - `"BlockBeats News & Economic Calendar"` → `"News & Economic Calendar"`（值 → `"快讯与财经日历"`）
  - `"Real-time crypto newsflash (BlockBeats), central bank decisions, and earnings releases."` → `"Real-time crypto newsflash, central bank decisions, and earnings releases."`（值同步去 BlockBeats）
  - `"Real-time crypto, macro, and on-chain indicators from BlockBeats."` → `"Real-time crypto, macro, and on-chain indicators."`
- `MarketsView`：换用清理后的 i18n key。
- `DataWindowPanel`：`"Market Pulse (BlockBeats)"` → `"Market Pulse"`。
- `toNewsItem` 的 `source: "BlockBeats"` 字段保留（数据契约，测试不动）。

## Risks / Trade-offs

- **末页恰好满 size 多一次空请求** → 空页置 `hasMore=false` 停止，代价为一次空请求，可接受。
- **滚动触发竞态**：快速滚动可能并发请求 → `loadingMore` 标志串行化；分类切换用请求序号/`alive` 标志防止旧响应覆盖。
- **累积数百条 DOM** → 用户已接受；若未来卡顿再做虚拟化（超出本次范围）。
- **来源标签移除后卡片视觉变化** → 布局由标题/时间/内容支撑，无依赖 source 的样式逻辑。

## Migration Plan

1. 纯前端改动，无数据/部署迁移；后端透传逻辑不动。
2. 顺序：`newsfeed.ts` 分页化（含测试）→ `NewsCalendarView` 无限滚动 → 各界面字样清理 → typecheck/test。
3. 回滚：恢复 `fetchNewsflash` 硬编码与标题文案即可。

## Open Questions

- 无（决策已与用户确认）。
