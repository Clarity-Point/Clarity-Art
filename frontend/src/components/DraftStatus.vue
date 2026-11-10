<script setup lang="ts">
defineProps<{ state: string; error: string }>();
defineEmits<{ retry: []; reload: [] }>();
</script>
<template>
  <div class="draft-status">
    <p role="status" class="muted">{{ state }}</p>
    <div v-if="error" class="draft-error">
      <p role="alert">{{ error }}</p>
      <div class="row wrap">
        <button type="button" class="btn-outline btn-sm" @click="$emit('retry')">
          Повторить сохранение
        </button>
        <button type="button" class="btn-outline btn-sm" @click="$emit('reload')">
          Загрузить сохранённую версию
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.wrap {
  flex-wrap: wrap;
}
.draft-status {
  margin-top: var(--space-3);
  font-size: var(--text-sm);
}
p {
  margin-bottom: var(--space-2);
}
.draft-error {
  color: var(--danger-text);
}
</style>
