<script setup lang="ts">
import type { KLineData } from "klinecharts";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AnalyzeResponse, Candle, ChartPoint, StructureResponse } from "../../api/types";
import {
  ChartController,
  type IndicatorSpec,
} from "../../lib/chartController";
import {
  boxToRect,
  candlesToKLineData,
  levelsToPriceLines,
  priceLineToOverlay,
  trendlineToSegment,
} from "../../lib/transform";

const props = withDefaults(
  defineProps<{
    candles: Candle[];
    analyze: AnalyzeResponse | null;
    structure?: StructureResponse | null;
    layers?: { sr: boolean; structure: boolean; smc: boolean };
    indicators?: IndicatorSpec[];
    drawings?: Array<{ id: string; name: string; points: ChartPoint[]; styles?: Record<string, unknown>; groupId?: string }>;
    lastCandle?: KLineData | null;
  }>(),
  {
    analyze: null,
    structure: null,
    layers: () => ({ sr: true, structure: true, smc: false }),
    indicators: () => [],
    drawings: () => [],
    lastCandle: null,
  },
);

const emit = defineEmits<{
  (e: "candle-click", p: { timestamp: number; value: number }): void;
}>();

const container = ref<HTMLDivElement | null>(null);
const controller = new ChartController();
let built = false;
let restored = false;

const timeWindow = () => {
  const first = props.candles[0]?.open_time ?? 0;
  const last = props.candles[props.candles.length - 1]?.open_time ?? 0;
  return { t0: first, t1: last };
};

function removeAutoGroup(group: string) {
  controller.removeOverlaysByGroup(group);
}

function rebuildAutoOverlays() {
  removeAutoGroup("auto-sr");
  removeAutoGroup("auto-structure");
  removeAutoGroup("auto-smc");
  if (!built) return;

  if (props.layers.sr && props.analyze) {
    for (const pl of levelsToPriceLines(props.analyze.levels)) {
      controller.createOverlay({ ...priceLineToOverlay(pl), groupId: "auto-sr" });
    }
  }

  if (props.structure) {
    const { t0, t1 } = timeWindow();
    if (props.layers.structure) {
      for (const tl of props.structure.trendlines) {
        controller.createOverlay({ ...trendlineToSegment(tl, t0, t1), groupId: "auto-structure" });
      }
      if (props.structure.box) {
        controller.createOverlay({ ...boxToRect(props.structure.box, t0, t1), groupId: "auto-structure" });
      }
    }
    if (props.layers.smc) {
      for (const liq of props.structure.liquidity) {
        const price = (liq as { price?: number }).price;
        if (typeof price === "number") {
          controller.createOverlay({
            name: "priceLine",
            points: [{ value: price }],
            groupId: "auto-smc",
          });
        }
      }
    }
  }
}

function applyIndicators(specs: IndicatorSpec[]) {
  if (!built) return;
  controller.setIndicators(specs);
}

watch(
  () => props.candles,
  (candles) => {
    if (!built) return;
    if (!candles.length) {
      controller.applyData([]);
      rebuildAutoOverlays();
      return;
    }
    controller.applyData(candlesToKLineData(candles));
    rebuildAutoOverlays();
  },
  { deep: false },
);

watch(
  () => [props.analyze, props.structure, props.layers],
  () => rebuildAutoOverlays(),
  { deep: true },
);

watch(
  () => props.indicators,
  (specs) => applyIndicators(specs ?? []),
  { deep: true },
);

watch(
  () => props.drawings,
  (drawings) => {
    if (!built || restored) return;
    controller.restoreOverlays(drawings);
  },
  { deep: true },
);

watch(
  () => props.lastCandle,
  (bar) => {
    if (built && bar) controller.updateData(bar);
  },
);

onMounted(() => {
  if (!container.value) return;
  controller.init({
    container: container.value,
    onDataPointClick: (p) => emit("candle-click", p),
  });
  built = true;
  if (props.candles.length) {
    controller.applyData(candlesToKLineData(props.candles));
  }
  applyIndicators(props.indicators ?? []);
  if (props.drawings.length) {
    controller.restoreOverlays(props.drawings);
    restored = true;
  }
  rebuildAutoOverlays();
});

onBeforeUnmount(() => {
  built = false;
  controller.destroy();
});

defineExpose({ controller });
</script>

<template>
  <div ref="container" class="w-full h-full min-h-0" />
</template>
