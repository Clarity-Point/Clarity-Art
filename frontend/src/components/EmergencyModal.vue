<template>
  <Teleport to="body">
    <div
      v-if="show"
      ref="dialog"
      tabindex="-1"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-title"
    >
      <div class="modal-content">
        <div class="header">
          <span class="warning-icon"><Icon name="alert-triangle" :size="26" /></span>
          <h2 id="emergency-title">Если вы чувствуете, что вам сейчас небезопасно</h2>
        </div>
        <p class="lead">
          Это приложение не определяет кризис и не заменяет человека. Если есть риск причинить вред
          себе или другим, пожалуйста, обратитесь за срочной помощью сейчас:
        </p>

        <div class="contacts">
          <div class="contact-item">
            <span class="contact-icon"><Icon name="phone" :size="18" /></span>
            <div class="contact-text">
              <strong>Экстренная помощь</strong>
              <a class="contact-number" href="tel:112">112</a>
              <span class="contact-note">если существует непосредственная опасность</span>
            </div>
          </div>
          <div class="contact-item">
            <span class="contact-icon"><Icon name="heart" :size="18" /></span>
            <div class="contact-text">
              <strong>Поддержка человека рядом</strong>
              <span class="contact-note"
                >свяжитесь с близким, лечащим специалистом или местной службой психологической
                помощи</span
              >
            </div>
          </div>
        </div>

        <p class="footer-msg">
          Арт-практики могут быть поддержкой, но не заменяют экстренную или профессиональную помощь.
        </p>

        <button @click="close" class="close-btn btn-primary btn-block">Закрыть окно</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import { useFocusScope } from '@/composables/useFocusScope';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
const dialog = ref<HTMLElement | null>(null);
const close = () => emit('close');
useFocusScope(
  computed(() => props.show),
  dialog,
  close,
  () => [...document.querySelectorAll<HTMLElement>('#app')],
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.modal-content {
  background: var(--card-bg);
  color: var(--text-color);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  max-width: 480px;
  width: 100%;
  margin: auto;
  border: 1px solid var(--border-color);
  border-top: 5px solid var(--danger-color);
  box-shadow: var(--shadow-lg);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.warning-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  background: var(--danger-bg);
  color: var(--danger-color);
  flex-shrink: 0;
}

.header h2 {
  color: var(--text-color);
  margin: 0;
  font-size: var(--text-xl);
}

.lead {
  color: var(--muted-text);
}

.contacts {
  background: var(--danger-bg);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius);
  margin: var(--space-5) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.contact-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.contact-item:not(:last-child) {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-color);
}

.contact-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--card-bg);
  color: var(--danger-color);
  flex-shrink: 0;
  margin-top: 2px;
}

.contact-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--danger-text);
}

.contact-text strong {
  font-size: var(--text-sm);
  font-weight: 600;
}

.contact-number {
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--danger-text);
}

.contact-note {
  font-size: var(--text-xs);
  opacity: 0.85;
}

.footer-msg {
  color: var(--muted-text);
  font-size: var(--text-sm);
}

.close-btn {
  margin-top: var(--space-2);
}
</style>
