<script setup lang="ts"></script>

<template>
  <div class="h-screen flex flex-col bg-base text-text">
    <slot name="header" />
    <div class="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr_300px] min-h-0">
      <div class="hidden md:block min-h-0 overflow-auto"><slot name="left" /></div>
      <div class="min-h-0 overflow-auto"><slot name="center" /></div>
      <div class="hidden md:block min-h-0 overflow-auto"><slot name="right" /></div>
    </div>
    <div class="h-64 shrink-0 border-t border-border"><slot name="bottom" /></div>
  </div>
</template>
