## 1. 鍒嗛〉鑾峰彇鍑芥暟

- [x] 1.1 `newsfeed.ts`锛氭柊澧?`NewsflashPage` 鎺ュ彛涓?`fetchNewsflashPage(type, page, size)`锛堣繑鍥?`{ items, page, hasMore }`锛宍hasMore` = 杩斿洖鏉℃暟 >= size锛夛紝淇濈暀 `fetchNewsflash` 棣栧睆灏佽鍏煎鏃ц皟鐢?- [x] 1.2 琛ュ厖 `newsfeed.test.ts`锛氬垎椤靛弬鏁伴€忎紶銆乣hasMore` 婊￠〉/绌洪〉鍒ゅ畾

## 2. 鏂伴椈鐣岄潰鏃犻檺婊氬姩

- [x] 2.1 `NewsCalendarView.tsx`锛氭柊澧?`page`/`loadingMore`/`hasMore` 鐘舵€侊紝婊氬姩鐩戝惉锛坄scrollTop + clientHeight >= scrollHeight - 120`锛夎Е鍙戝姞杞戒笅涓€椤?- [x] 2.2 杩藉姞鎸?id 鍘婚噸锛涘垏鎹㈠垎绫绘椂閲嶇疆 page/鍒楄〃锛涚┖椤电疆 `hasMore=false`锛涘姞杞戒腑闃插苟鍙戯紙`loadingMore` 涓茶锛?- [x] 2.3 鏈熬娓叉煋鍔犺浇涓?銆屽凡鍔犺浇鍏ㄩ儴銆嶅崰浣?- [x] 2.4 琛ュ厖 `NewsCalendarView` 娴嬭瘯锛堝鍙锛夛細婊氬姩鍔犺浇杩藉姞銆佸幓閲嶃€佸垏鎹㈠垎绫婚噸缃?
## 3. 鍝佺墝瀛楁牱娓呯悊

- [x] 3.1 `i18n.ts`锛氭洿鏂?3 鏉?BlockBeats 鐩稿叧 key/鍊硷紙鏂伴椈椤垫爣棰?鍓爣棰樸€佸競鍦烘瑙堝壇鏍囬锛?- [x] 3.2 `NewsCalendarView.tsx`锛氭爣棰?鍓爣棰樻崲鐢ㄦ柊 key锛屽垹闄ゆ柊闂诲崱鐗囨潵婧愭爣绛?`<span>{n.source}</span>`锛屼繚鐣?Full Article 澶栭摼
- [x] 3.3 `NewsPanel.tsx`锛氬垹闄ゆ潵婧愭爣绛炬樉绀猴紙濡傛湁锛夛紝淇濈暀澶栭摼
- [x] 3.4 `MarketsView.tsx`銆乣DataWindowPanel.tsx`锛氭崲鐢ㄦ竻鐞嗗悗鐨勬枃妗?key

## 4. 楠岃瘉

- [x] 4.1 grep 澶嶆牳 `frontend/src` 涓晫闈㈠彲瑙佺殑 "BlockBeats" 瀛楁牱宸茬Щ闄わ紙鏁版嵁瀛楁/娉ㄩ噴闄ゅ锛?- [x] 4.2 杩愯 `npm run typecheck`锛坒rontend锛夋棤绫诲瀷閿欒
- [x] 4.3 杩愯 `npm test`锛坒rontend锛夊叏閮ㄩ€氳繃

