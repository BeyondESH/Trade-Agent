<script setup lang="ts">
import type { SeriesRef } from "../../api/types";
import Panel from "../../ui/Panel.vue";
import OrderConfirmDialog from "../panels/OrderConfirmDialog.vue";

defineProps<{ series: SeriesRef }>();
</script>

<template>
  <Panel class="rounded-none border-0 border-l">
    <template #title>Order</template>
    <OrderConfirmDialog :series="series" />
  </Panel>
</template>
