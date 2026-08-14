<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ variant?: "primary" | "ghost" | "up" | "down" }>(), {
  variant: "ghost",
});

const styles: Record<string, string> = {
  primary: "bg-accent text-black hover:brightness-110",
  ghost: "bg-panel2 text-text border border-border hover:border-muted",
  up: "bg-up text-black hover:brightness-110",
  down: "bg-down text-white hover:brightness-110",
};

const cls = computed(
  () =>
    `px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition ${styles[props.variant]}`,
);
</script>

<template>
  <button :class="cls"><slot /></button>
</template>
