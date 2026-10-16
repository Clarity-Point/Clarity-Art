import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

export const useToastStore = defineStore('toasts', () => {
  const messages = ref<ToastMessage[]>([]);
  let nextId = 0;

  function show(text: string, tone: ToastTone = 'info', duration = 4500) {
    const id = ++nextId;
    messages.value.push({ id, text, tone });
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }

  function dismiss(id: number) {
    messages.value = messages.value.filter((message) => message.id !== id);
  }

  const success = (text: string) => show(text, 'success');
  const error = (text: string) => show(text, 'error', 0);
  const info = (text: string) => show(text, 'info');

  return { messages, show, success, error, info, dismiss };
});
