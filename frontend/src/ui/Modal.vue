<script setup lang="ts">
defineProps<{ title: string }>();
const open = defineModel<boolean>({ required: true });
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        @click="open = false"
      >
        <div
          class="bg-panel border border-border rounded-lg w-[360px] max-w-[90vw]"
          @click.stop
        >
          <div class="px-4 py-3 border-b border-border font-semibold text-sm">{{ title }}</div>
          <div class="p-4">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
