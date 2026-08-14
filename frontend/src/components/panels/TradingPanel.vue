<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../../api/client";
import type { Portfolio } from "../../api/types";
import Badge from "../../ui/Badge.vue";
import Button from "../../ui/Button.vue";

const pf = ref<Portfolio | null>(null);
const trades = ref<Record<string, unknown>[]>([]);

const refresh = () => {
  api
    .portfolio()
    .then((p) => (pf.value = p))
    .catch(() => undefined);
  api
    .journal()
    .then((r) => (trades.value = r.trades))
    .catch(() => undefined);
};

onMounted(refresh);

const exportJson = () => {
  const blob = new Blob([JSON.stringify(trades.value, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "journal.json";
  a.click();
};
</script>

<template>
  <div class="flex flex-col gap-2 text-xs">
    <div class="flex items-center gap-4">
      <template v-if="pf">
        <span class="text-muted">equity</span>
        <span class="tnum">{{ pf.equity.toFixed(2) }}</span>
        <span class="text-muted">positions</span>
        <Badge>{{ Object.keys(pf.positions).length }}</Badge>
      </template>
      <div class="ml-auto flex gap-2">
        <Button @click="refresh">Refresh</Button>
        <Button @click="exportJson">Export JSON</Button>
      </div>
    </div>
    <table class="w-full text-left tnum">
      <thead class="text-muted text-[10px] uppercase">
        <tr>
          <th class="py-1">symbol</th>
          <th>side</th>
          <th>pnl</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, i) in trades.slice(-12)" :key="i" class="border-t border-border">
          <td class="py-1">{{ String((t as any).symbol ?? "") }}</td>
          <td>{{ String((t as any).side ?? "") }}</td>
          <td :class="Number((t as any).pnl) >= 0 ? 'text-up' : 'text-down'">
            {{ String((t as any).pnl ?? "") }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
