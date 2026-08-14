<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ tone?: "up" | "down" | "muted" }>(), {
  tone: "muted",
});

const cls = computed(
  () => (props.tone === "up" ? "text-up" : props.tone === "down" ? "text-down" : "text-muted"),
);
</script>

<template>
  <span class="tnum" :class="cls"><slot /></span>
</template>
