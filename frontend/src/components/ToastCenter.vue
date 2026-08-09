<template>
  <div class="toast-region" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div
        v-for="message in messages"
        :key="message.id"
        :class="['toast-message', `toast-${message.tone}`]"
        :role="message.tone === 'error' ? 'alert' : 'status'"
      >
        <Icon :name="iconFor(message.tone)" :size="18" />
        <span>{{ message.text }}</span>
        <button type="button" aria-label="Закрыть уведомление" @click="dismiss(message.id)">
          <Icon name="x" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Icon from '@/components/Icon.vue';
import { useToastStore, type ToastTone } from '@/stores/toastStore';

const toastStore = useToastStore();
const { messages } = storeToRefs(toastStore);
const { dismiss } = toastStore;

const iconFor = (tone: ToastTone) => {
  if (tone === 'success') return 'check-circle';
  if (tone === 'error') return 'alert-triangle';
  return 'info';
};
</script>

<style scoped>
.toast-region {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 3000;
  width: min(390px, calc(100vw - var(--space-6)));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}
.toast-message {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--elevated-bg);
  color: var(--text-color);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}
.toast-success {
  border-color: var(--success-text);
}
.toast-success > :deep(.icon) {
  color: var(--success-text);
}
.toast-error {
  border-color: var(--danger-color);
}
.toast-error > :deep(.icon) {
  color: var(--danger-text);
}
.toast-info > :deep(.icon) {
  color: var(--info-text);
}
.toast-message button {
  display: inline-flex;
  padding: var(--space-1);
  border: 0;
  background: transparent;
  color: var(--muted-text);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--transition),
    transform var(--transition);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (max-width: 600px) {
  .toast-region {
    right: 50%;
    transform: translateX(50%);
    bottom: var(--space-3);
  }
}
</style>
