<script setup lang="ts">
import { computed } from "vue";
import type { SeriesRef } from "../../api/types";
import Controls from "../panels/Controls.vue";

const props = defineProps<{ series: SeriesRef; price?: number; change?: number }>();
const emit = defineEmits<{ (e: "timeframe", tf: string): void; (e: "load"): void }>();

const TIMEFRAMES = ["5m", "1d"];

const up = computed(() => (props.change ?? 0) >= 0);
const priceText = computed(() => (props.price ? props.price.toFixed(2) : "--"));
const changeText = computed(() =>
  props.change !== undefined
    ? `${props.change >= 0 ? "+" : ""}${props.change.toFixed(2)}%`
    : "",
);
</script>

<template>
  <header class="h-12 shrink-0 border-b border-border bg-panel flex items-center gap-4 px-4">
    <span class="font-bold text-accent">◆ AI-Trade</span>
    <span class="font-semibold">{{ series.symbol }}</span>
    <span class="tnum text-base" :class="up ? 'text-up' : 'text-down'">{{ priceText }}</span>
    <span
      v-if="change !== undefined"
      class="tnum text-xs"
      :class="up ? 'text-up' : 'text-down'"
    >
      {{ changeText }}
    </span>
    <div class="flex gap-1 ml-2">
      <button
        v-for="tf in TIMEFRAMES"
        :key="tf"
        @click="emit('timeframe', tf)"
        class="px-2 py-1 rounded text-xs"
        :class="series.timeframe === tf ? 'bg-panel2 text-text' : 'text-muted hover:text-text'"
      >
        {{ tf }}
      </button>
      <button
        @click="emit('load')"
        class="px-2 py-1 rounded text-xs text-muted hover:text-text"
      >
        ↻
      </button>
    </div>
    <div class="ml-auto">
      <Controls />
    </div>
  </header>
</template>
