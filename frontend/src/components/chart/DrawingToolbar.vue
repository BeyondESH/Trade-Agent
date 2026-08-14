<script setup lang="ts">
import { computed } from "vue";
import Button from "../../ui/Button.vue";

const props = defineProps<{ active?: string | null }>();
const emit = defineEmits<{ (e: "select", tool: string | null): void; (e: "clear"): void }>();

const TOOLS = [
  { id: "segment", label: "seg" },
  { id: "rayLine", label: "ray" },
  { id: "fibonacciLine", label: "fib" },
  { id: "rect", label: "rect" },
  { id: "priceLine", label: "price" },
  { id: "simpleAnnotation", label: "txt" },
  { id: "brush", label: "brush" },
];

const activeId = computed(() => props.active ?? null);
</script>

<template>
  <div class="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-panel overflow-x-auto">
    <button
      v-for="t in TOOLS"
      :key="t.id"
      class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
      :class="activeId === t.id ? 'bg-accent text-black' : 'text-muted hover:text-text'"
      @click="emit('select', activeId === t.id ? null : t.id)"
    >
      {{ t.label }}
    </button>
    <Button
      class="!px-1.5 !py-0.5 !text-[10px] shrink-0"
      @click="emit('clear')"
    >
      clear
    </Button>
  </div>
</template>
