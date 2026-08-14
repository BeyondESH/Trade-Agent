<script setup lang="ts">
import { ref } from "vue";
import { ApiError, api } from "../../api/client";
import type { SeriesRef } from "../../api/types";
import Button from "../../ui/Button.vue";
import Input from "../../ui/Input.vue";

const props = defineProps<{ series: SeriesRef }>();

const side = ref("long");
const price = ref(0);
const token = ref<string | null>(null);
const msg = ref("");

const submit = async () => {
  msg.value = "";
  try {
    const r = await api.order({
      category: props.series.category,
      symbol: props.series.symbol,
      side: side.value,
      leverage: 100,
      price: price.value,
    });
    token.value = r.token;
    msg.value = `preview margin=${r.preview.margin}, confirm to execute`;
  } catch (e) {
    msg.value = e instanceof ApiError ? e.message : String(e);
  }
};

const confirm = async () => {
  if (!token.value) return;
  try {
    const r = await api.orderConfirm(token.value);
    msg.value = `filled=${r.filled} live=${r.live} ${r.reason}`;
  } catch (e) {
    msg.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    token.value = null;
  }
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-2 gap-2">
      <button
        @click="side = 'long'"
        class="py-1.5 rounded text-xs font-semibold"
        :class="side === 'long' ? 'bg-up text-black' : 'bg-panel2 text-muted'"
      >
        long
      </button>
      <button
        @click="side = 'short'"
        class="py-1.5 rounded text-xs font-semibold"
        :class="side === 'short' ? 'bg-down text-white' : 'bg-panel2 text-muted'"
      >
        short
      </button>
    </div>
    <select v-model="side" aria-label="side" class="bg-base border border-border rounded px-2 py-1.5 text-xs">
      <option value="long">long</option>
      <option value="short">short</option>
    </select>
    <Input v-model.number="price" type="number" placeholder="price" />
    <div class="grid grid-cols-2 gap-2">
      <Button @click="submit">Submit</Button>
      <Button variant="primary" :disabled="!token" @click="confirm">Confirm</Button>
    </div>
    <div class="text-[11px] text-muted min-h-[1em]">{{ msg }}</div>
  </div>
</template>
