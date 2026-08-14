<script setup lang="ts">
const model = defineModel<string | number>();
</script>

<template>
  <input
    v-model="model"
    class="bg-base border border-border rounded px-2 py-1.5 text-xs text-text tnum outline-none focus:border-accent w-full"
  />
</template>
