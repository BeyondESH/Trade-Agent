<script setup lang="ts">
import { computed } from "vue";
import type { IndicatorSpec } from "../../lib/chartController";

const props = defineProps<{ indicators: IndicatorSpec[] }>();
const emit = defineEmits<{ (e: "change", indicators: IndicatorSpec[]): void }>();

const SUB_INDICATORS = ["MACD", "KDJ", "RSI", "VOL", "DMI"];
const MAIN_INDICATORS = ["MA", "BOLL", "EMA", "SAR"];

const current = computed(() => props.indicators);

function has(name: string, pane: IndicatorSpec["pane"]) {
  return current.value.some((i) => i.name === name && i.pane === pane);
}

function toggle(name: string, pane: IndicatorSpec["pane"]) {
  const next = has(name, pane)
    ? current.value.filter((i) => !(i.name === name && i.pane === pane))
    : [...current.value, { name, pane }];
  emit("change", next);
}

const activePane = (pane: IndicatorSpec["pane"]) => current.value.filter((i) => i.pane === pane);
</script>

<template>
  <div class="flex items-center gap-3 px-2 py-1 border-b border-border bg-panel overflow-x-auto text-[10px]">
    <span class="text-muted uppercase shrink-0">ind</span>
    <button
      v-for="name in SUB_INDICATORS"
      :key="name"
      class="px-1.5 py-0.5 rounded font-semibold shrink-0"
      :class="has(name, 'sub') ? 'bg-panel2 text-text' : 'text-muted hover:text-text'"
      @click="toggle(name, 'sub')"
    >
      {{ name }}
    </button>
    <span class="text-muted uppercase shrink-0 ml-1">main</span>
    <button
      v-for="name in MAIN_INDICATORS"
      :key="name"
      class="px-1.5 py-0.5 rounded font-semibold shrink-0"
      :class="has(name, 'candle') ? 'bg-panel2 text-text' : 'text-muted hover:text-text'"
      @click="toggle(name, 'candle')"
    >
      {{ name }}
    </button>
  </div>
</template>
