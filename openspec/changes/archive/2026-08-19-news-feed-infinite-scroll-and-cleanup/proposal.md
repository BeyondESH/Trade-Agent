# News Feed Infinite Scroll And Cleanup

## Why

新闻界面通过 BlockBeats API 只拉取第一页 20 条新闻（前端 `fetchNewsflash` 硬编码 `page=1,size=20`），24h 内全部新闻无法滚动查看；同时界面仍残留 "BlockBeats" 品牌字样（标题、副标题、来源标签），与 BeyondEther 品牌定位不符。

## What Changes

- **新闻分页与无限滚动**：`fetchNewsflash` 支持 `page`/`size` 参数并返回分页信息；新闻界面滚动到底部自动加载下一页并追加渲染，按新闻 id 去重；全部新闻（数百条）累积渲染，不设上限。
- **去除 BlockBeats 品牌字样**：新闻页标题/副标题、MarketsView、DataWindowPanel 中的 "BlockBeats" 可见文本移除；每条新闻的来源标签不再显示（数据层 `source` 字段保留）；**Full Article 外链保留**（跳转 `m.theblockbeats.info/flash/{id}`）。
- 后端 `/blockbeats/newsflash/{type}` 透传 page/size 保持不变，无后端改动。

## Capabilities

### New Capabilities

- `news-infinite-scroll`: 新闻获取支持分页，界面滚动到底自动加载后续页，累积显示全部新闻并去重。
- `news-blockbeats-cleanup`: 界面可见文本移除 BlockBeats 品牌字样（标题/副标题/来源标签），保留数据来源字段与外部链接。

### Modified Capabilities

<!-- 无既有 spec 行为变更 -->

## Impact

- `frontend/src/lib/newsfeed.ts`：`fetchNewsflash` 增加分页参数并返回 `{ items, page, hasMore }`。
- `frontend/src/components/views/NewsCalendarView.tsx`：无限滚动加载逻辑、标题/副标题/来源标签清理。
- `frontend/src/components/sidebar/NewsPanel.tsx`：来源标签清理，必要时接分页。
- `frontend/src/lib/i18n.ts`：BlockBeats 相关 key/值更新。
- `frontend/src/components/views/MarketsView.tsx`、`frontend/src/components/sidebar/DataWindowPanel.tsx`：BlockBeats 字样清理。
- 无后端/依赖变更。
