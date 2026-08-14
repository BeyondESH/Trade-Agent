<script setup lang="ts">
defineProps<{ className?: string }>();
</script>

<template>
  <div class="bg-panel border border-border rounded-md flex flex-col min-h-0" :class="className">
    <div
      v-if="$slots.title"
      class="flex items-center justify-between px-3 py-2 border-b border-border text-xs font-semibold text-muted uppercase tracking-wide"
    >
      <span><slot name="title" /></span>
      <span><slot name="right" /></span>
    </div>
    <div class="p-3 overflow-auto min-h-0">
      <slot />
    </div>
  </div>
</template>
