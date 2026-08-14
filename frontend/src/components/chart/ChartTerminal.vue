<script setup lang="ts">
import type { KLineData } from "klinecharts";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  AnalyzeResponse,
  Candle,
  ChartConfig,
  StructureResponse,
} from "../../api/types";
import type { IndicatorSpec } from "../../lib/chartController";
import Chart from "./Chart.vue";
import DrawingToolbar from "./DrawingToolbar.vue";
import IndicatorPanel from "./IndicatorPanel.vue";

const props = withDefaults(
  defineProps<{
    candles: Candle[];
    analyze: AnalyzeResponse | null;
    structure?: StructureResponse | null;
    lastCandle?: KLineData | null;
    initial?: ChartConfig | null;
  }>(),
  {
    analyze: null,
    structure: null,
    lastCandle: null,
    initial: null,
  },
);

const emit = defineEmits<{ (e: "change", state: ChartConfig): void }>();

const chartRef = ref<InstanceType<typeof Chart> | null>(null);

const indicators = ref<IndicatorSpec[]>(
  props.initial?.indicators?.length
    ? props.initial.indicators
    : [
        { name: "VOL", pane: "sub" },
        { name: "MACD", pane: "sub" },
      ],
);
const layers = ref(props.initial?.layers ?? { sr: true, structure: true, smc: false });
const drawings = ref(props.initial?.drawings ?? []);
const activeTool = ref<string | null>(null);

let syncTimer: ReturnType<typeof setInterval> | null = null;

function emitChange() {
  emit("change", {
    indicators: indicators.value,
    drawings: drawings.value,
    layers: layers.value,
  });
}

function syncDrawings() {
  const c = chartRef.value?.controller;
  if (!c) return;
  const next = c.getOverlays();
  if (JSON.stringify(next) !== JSON.stringify(drawings.value)) {
    drawings.value = next;
    emitChange();
  }
}

function onTool(tool: string | null) {
  activeTool.value = tool;
  chartRef.value?.controller.setDrawTool(tool);
  setTimeout(syncDrawings, 50);
}

function onClear() {
  chartRef.value?.controller.removeAllDrawings();
  drawings.value = [];
  activeTool.value = null;
  emitChange();
}

function onIndicators(specs: IndicatorSpec[]) {
  indicators.value = specs;
  emitChange();
}

function onLayer(key: keyof ChartConfig["layers"]) {
  layers.value = { ...layers.value, [key]: !layers.value[key] };
  emitChange();
}

watch(
  () => props.initial,
  (init) => {
    if (!init) return;
    if (init.indicators?.length) indicators.value = init.indicators;
    if (init.layers) layers.value = { ...init.layers };
    if (init.drawings?.length) drawings.value = init.drawings;
  },
  { deep: true },
);

onMounted(() => {
  syncTimer = setInterval(syncDrawings, 3000);
});

onBeforeUnmount(() => {
  if (syncTimer) clearInterval(syncTimer);
});
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-base">
    <DrawingToolbar :active="activeTool" @select="onTool" @clear="onClear" />
    <IndicatorPanel :indicators="indicators" @change="onIndicators" />
    <div class="flex-1 min-h-0">
      <Chart
        ref="chartRef"
        :candles="candles"
        :analyze="analyze"
        :structure="structure"
        :layers="layers"
        :indicators="indicators"
        :drawings="drawings"
        :last-candle="lastCandle"
      />
    </div>
    <div class="flex items-center gap-3 px-2 py-1 border-t border-border text-[10px] text-muted">
      <label class="flex items-center gap-1">
        <input type="checkbox" class="accent-accent" :checked="layers.sr" @change="onLayer('sr')" />
        S/R
      </label>
      <label class="flex items-center gap-1">
        <input
          type="checkbox"
          class="accent-accent"
          :checked="layers.structure"
          @change="onLayer('structure')"
        />
        structure
      </label>
      <label class="flex items-center gap-1">
        <input type="checkbox" class="accent-accent" :checked="layers.smc" @change="onLayer('smc')" />
        SMC
      </label>
    </div>
  </div>
</template>
