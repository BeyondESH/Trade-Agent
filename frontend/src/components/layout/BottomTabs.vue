<script setup lang="ts">
import { ref } from "vue";
import Tabs from "../../ui/Tabs.vue";
import StrategyEditor from "../panels/StrategyEditor.vue";
import TradingPanel from "../panels/TradingPanel.vue";

const active = ref("positions");
</script>

<template>
  <div class="h-full flex flex-col bg-panel">
    <Tabs
      v-model="active"
      :tabs="[
        { id: 'positions', label: 'Positions / Journal' },
        { id: 'strategy', label: 'Strategy' },
      ]"
    />
    <div class="flex-1 overflow-auto p-3">
      <TradingPanel v-if="active === 'positions'" />
      <StrategyEditor v-else />
    </div>
  </div>
</template>
