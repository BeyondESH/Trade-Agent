<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ApiError, api } from "../../api/client";
import type { AppConfig } from "../../api/types";
import Button from "../../ui/Button.vue";
import Input from "../../ui/Input.vue";

const cfg = ref<AppConfig | null>(null);
const msg = ref("");

const load = () =>
  api
    .getConfig()
    .then((c) => (cfg.value = c))
    .catch((e) => (msg.value = String(e)));

onMounted(load);

const save = async () => {
  if (!cfg.value) return;
  try {
    await api.putConfig(cfg.value);
    msg.value = "saved";
    await load();
  } catch (e) {
    msg.value = e instanceof ApiError ? `error: ${e.message}` : String(e);
  }
};

const prompt = computed({
  get: () => cfg.value?.system_prompt ?? "",
  set: (v: string) => {
    if (cfg.value) cfg.value.system_prompt = v || null;
  },
});

const rules = computed({
  get: () => cfg.value?.manual_rules.join("\n") ?? "",
  set: (v: string) => {
    if (cfg.value) cfg.value.manual_rules = v.split("\n").filter(Boolean);
  },
});
</script>

<template>
  <div v-if="cfg" class="grid grid-cols-2 gap-3 max-w-2xl">
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase text-muted">provider kind</span>
      <Input v-model="cfg.provider.kind" />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase text-muted">near_pct</span>
      <Input v-model.number="cfg.provider.near_pct" type="number" />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase text-muted">margin_pct</span>
      <Input v-model.number="cfg.risk.margin_pct" type="number" />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase text-muted">max_drawdown_pct</span>
      <Input v-model.number="cfg.risk.max_drawdown_pct" type="number" />
    </label>
    <div class="col-span-2">
      <label class="flex flex-col gap-1">
        <span class="text-[10px] uppercase text-muted">system prompt</span>
        <textarea
          v-model="prompt"
          class="bg-base border border-border rounded px-2 py-1.5 text-xs w-full outline-none focus:border-accent"
          rows="2"
        />
      </label>
    </div>
    <div class="col-span-2">
      <label class="flex flex-col gap-1">
        <span class="text-[10px] uppercase text-muted">manual rules (one per line)</span>
        <textarea
          v-model="rules"
          class="bg-base border border-border rounded px-2 py-1.5 text-xs w-full outline-none focus:border-accent"
          rows="2"
        />
      </label>
    </div>
    <div class="col-span-2 flex items-center gap-3">
      <Button variant="primary" @click="save">Save</Button>
      <span class="text-xs text-muted">{{ msg }}</span>
    </div>
  </div>
  <div v-else class="text-muted text-xs">Loading config…</div>
</template>
