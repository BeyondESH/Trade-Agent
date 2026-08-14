<script setup lang="ts">
import { reactive } from "vue";
import { api } from "../../api/client";

const state = reactive({ kill_switch: false, live_enabled: false });

const update = (body: { kill_switch?: boolean; live_enabled?: boolean }) =>
  api
    .control(body)
    .then((s) => {
      state.kill_switch = s.kill_switch;
      state.live_enabled = s.live_enabled;
    })
    .catch(() => undefined);
</script>

<template>
  <div class="flex items-center gap-4 text-xs">
    <label class="flex items-center gap-1.5">
      <input
        type="checkbox"
        class="accent-down"
        :checked="state.kill_switch"
        @change="update({ kill_switch: ($event.target as HTMLInputElement).checked })"
      />
      <span :class="state.kill_switch ? 'text-down font-semibold' : 'text-muted'">kill-switch</span>
    </label>
    <label class="flex items-center gap-1.5">
      <input
        type="checkbox"
        class="accent-accent"
        :checked="state.live_enabled"
        @change="update({ live_enabled: ($event.target as HTMLInputElement).checked })"
      />
      <span :class="state.live_enabled ? 'text-accent font-semibold' : 'text-muted'">live</span>
    </label>
  </div>
</template>
