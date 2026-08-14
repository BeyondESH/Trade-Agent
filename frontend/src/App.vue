<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "./api/client";
import type { AnalyzeResponse, Candle, ChartConfig, SeriesRef, StructureResponse } from "./api/types";
import ChartTerminal from "./components/chart/ChartTerminal.vue";
import AppShell from "./components/layout/AppShell.vue";
import BottomTabs from "./components/layout/BottomTabs.vue";
import Header from "./components/layout/Header.vue";
import MarketList from "./components/layout/MarketList.vue";
import OrderPanel from "./components/layout/OrderPanel.vue";
import { useSnapshot } from "./composables/useSnapshot";
import { candleToKLine } from "./lib/transform";

const DEFAULT: SeriesRef = { category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" };

const series = ref<SeriesRef>({ ...DEFAULT });
const candles = ref<Candle[]>([]);
const analyze = ref<AnalyzeResponse | null>(null);
const structure = ref<StructureResponse | null>(null);
const chartState = ref<ChartConfig | null>(null);
const snap = useSnapshot(series);

const load = () => {
  api
    .candles(series.value)
    .then((r) => {
      if (r.count > 0) {
        candles.value = r.candles;
        return;
      }
      api
        .candlesRecent(series.value)
        .then((recent) => (candles.value = recent.candles))
        .catch(() => (candles.value = []));
    })
    .catch(() => (candles.value = []));
  api
    .analyze(series.value)
    .then((a) => (analyze.value = a))
    .catch(() => (analyze.value = null));
  api
    .structure(series.value)
    .then((s) => (structure.value = s))
    .catch(() => (structure.value = null));
};

const loadChartConfig = () => {
  chartState.value = null;
  api
    .chartConfig(series.value)
    .then((c) => (chartState.value = c))
    .catch(() => (chartState.value = null));
};

watch(
  () => [series.value.category, series.value.symbol, series.value.timeframe],
  () => {
    load();
    loadChartConfig();
  },
  { immediate: true },
);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function onChartChange(state: ChartConfig) {
  const target = { ...series.value };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveChartConfig(target, state).catch(() => undefined);
  }, 800);
}

const change = computed(() => {
  if (candles.value.length < 2) return undefined;
  const first = candles.value[0].open;
  const last = candles.value[candles.value.length - 1].close;
  return first ? ((last - first) / first) * 100 : undefined;
});

const price = computed(() =>
  snap.value?.price ?? (candles.value.length ? candles.value[candles.value.length - 1].close : undefined),
);

const lastCandleKLine = computed(() =>
  snap.value?.last_candle ? candleToKLine(snap.value.last_candle) : null,
);
</script>

<template>
  <AppShell>
    <template #header>
      <Header :series="series" :price="price" :change="change"
        @timeframe="series = { ...series, timeframe: $event }" @load="load" />
    </template>
    <template #left>
      <MarketList :current="series.symbol" @select="series = { ...series, symbol: $event }" />
    </template>
    <template #center>
      <ChartTerminal
        :candles="candles"
        :analyze="analyze"
        :structure="structure"
        :initial="chartState"
        :last-candle="lastCandleKLine"
        @change="onChartChange"
      />
    </template>
    <template #right>
      <OrderPanel :series="series" />
    </template>
    <template #bottom>
      <BottomTabs />
    </template>
  </AppShell>
</template>
