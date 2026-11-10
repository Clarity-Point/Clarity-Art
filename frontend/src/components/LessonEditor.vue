<template>
  <details class="lesson-editor">
    <summary>Редактировать материал урока</summary>
    <form class="stack" @submit.prevent="save">
      <label>Название<input v-model="title" required maxlength="200" /></label>
      <label
        >Материал урока<textarea v-model="content" rows="10" maxlength="20000"></textarea>
      </label>
      <p class="muted">Можно использовать Markdown: заголовки, списки и ссылки на материалы.</p>
      <button class="btn-outline" :disabled="busy">
        {{ busy ? 'Сохраняем…' : 'Сохранить урок' }}
      </button>
      <p role="status">{{ message }}</p>
    </form>
  </details>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';
import type { Lesson } from '@/stores/coursesStore';
const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits<{ saved: [title: string, content: string] }>();
const title = ref(props.lesson.title),
  content = ref(props.lesson.content || ''),
  busy = ref(false),
  message = ref('');
watch(
  () => props.lesson.id,
  () => {
    title.value = props.lesson.title;
    content.value = props.lesson.content || '';
    message.value = '';
  },
);
async function save() {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    await axios.put(`${import.meta.env.VITE_API_URL || '/api'}/admin/lessons/${props.lesson.id}`, {
      title: title.value,
      content: content.value,
    });
    emit('saved', title.value, content.value);
    message.value = 'Урок сохранён.';
  } catch {
    message.value = 'Не удалось сохранить урок.';
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.lesson-editor {
  width: 100%;
}
form {
  margin-top: var(--space-3);
}
label {
  display: grid;
  gap: var(--space-2);
}
</style>
