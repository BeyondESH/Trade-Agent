<script setup lang="ts">
const props = defineProps<{ tabs: { id: string; label: string }[] }>();
const active = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex gap-1 border-b border-border px-2">
    <button
      v-for="t in props.tabs"
      :key="t.id"
      @click="active = t.id"
      class="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition"
      :class="
        active === t.id
          ? 'border-accent text-text'
          : 'border-transparent text-muted hover:text-text'
      "
    >
      {{ t.label }}
    </button>
  </div>
</template>
