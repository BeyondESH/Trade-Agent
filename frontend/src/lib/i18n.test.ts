import { describe, expect, it } from "vitest";
import { t, zh } from "./i18n";

describe("i18n dictionary", () => {
  it("translates known keys to Chinese", () => {
    expect(t("Watchlist")).toBe("自选");
    expect(t("Alerts")).toBe("提醒");
    expect(t("Order Book (DOM)")).toBe("订单簿 (DOM)");
  });

  it("falls back to the raw key for unknown strings", () => {
    expect(t("NoSuchKey")).toBe("NoSuchKey");
  });

  it("covers the core shell labels", () => {
    const core = [
      "New Chart Tab",
      "Command Palette",
      "Markets",
      "Screener",
      "Heatmaps",
      "Community",
      "News",
      "Pine Studio",
      "Brokers",
      "Watchlist",
      "Alerts",
      "Data Window",
      "Economic Calendar",
      "Order Book (DOM)",
    ];
    for (const k of core) {
      expect(t(k)).not.toBe(k);
    }
  });

  it("resolves the i18n sweep keys to the expected Chinese", () => {
    const sweep: Record<string, string> = {
      "No news": "暂无新闻",
      "Spread:": "价差:",
      Positions: "持仓",
      "Working Orders": "挂单",
      "Broker Summary": "券商概览",
      "Market Close": "市价平仓",
      Cancel: "取消",
      "100x Cross Margin": "100x 全仓保证金",
      "Quick search...": "快速搜索...",
      "Mark all read": "全部标为已读",
      "UTC+0 (Live)": "UTC+0 (实时)",
      "Visualize relative market capitalization and sector performance in real-time.":
        "实时可视化相对市值与板块表现。",
      "S&P 500 Equities": "标普 500 成分股",
      "Top Crypto Market Cap": "加密货币市值领先",
      "S&P 500 Mega-Cap Map": "标普 500 巨头热力图",
      "Total Tracked Market Cap": "追踪总市值",
      "Loading netflow...": "正在加载净流入...",
      "Top 10 Netflow": "净流入前十",
      "No netflow data — check BB_API_KEY / network availability":
        "暂无净流入数据 - 请检查 BB_API_KEY / 网络可用性",
      inflow: "流入",
      outflow: "流出",
      "Discover trading strategies, harmonic patterns, and price action insights published by top global traders.":
        "发现全球顶级交易员发布的交易策略、谐波形态与价格行为洞见。",
    };
    for (const [k, v] of Object.entries(sweep)) {
      expect(t(k)).toBe(v);
      expect(t(k)).not.toBe(k);
    }
  });

  it("dictionary is a flat string map", () => {
    for (const [k, v] of Object.entries(zh)) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
