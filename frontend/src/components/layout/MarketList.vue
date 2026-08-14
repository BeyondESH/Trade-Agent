<script setup lang="ts">
import Panel from "../../ui/Panel.vue";

defineProps<{ current: string }>();
const emit = defineEmits<{ (e: "select", symbol: string): void }>();

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
</script>

<template>
  <Panel class="rounded-none border-0 border-r">
    <template #title>Markets</template>
    <div class="flex flex-col">
      <button
        v-for="s in SYMBOLS"
        :key="s"
        @click="emit('select', s)"
        class="flex items-center justify-between px-2 py-2 rounded text-xs"
        :class="current === s ? 'bg-panel2 text-text' : 'text-muted hover:bg-panel2/50'"
      >
        <span class="font-semibold">{{ s }}</span>
        <span class="tnum text-[10px] text-muted">perp</span>
      </button>
    </div>
  </Panel>
</template>
