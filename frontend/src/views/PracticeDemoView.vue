<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import PracticeCanvas from '@/features/practices/PracticeCanvas.vue';
import { getCatalog, practiceError, type Practice } from '@/features/practices/api';

const practice = ref<Practice>();
const dirty = ref(false);
const canvas = ref<InstanceType<typeof PracticeCanvas>>();
const error = ref('');
async function load() {
  error.value = '';
  try {
    practice.value = (await getCatalog()).practices.find(({ id }) => id === 'two-lines');
    if (!practice.value) error.value = 'Карточка сейчас недоступна.';
  } catch (reason) {
    error.value = practiceError(reason, 'Не удалось загрузить практику.');
  }
}
function changed(hasDrawing: boolean) {
  dirty.value = hasDrawing;
}
function beforeUnload(event: BeforeUnloadEvent) {
  canvas.value?.commitStroke();
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onBeforeRouteLeave(() => {
  canvas.value?.commitStroke();
  return !dirty.value || window.confirm('Уйти без скачивания рисунка?');
});
onMounted(() => {
  void load();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <main class="page demo-page">
    <header class="page-head">
      <h1 class="page-title display">Две линии</h1>
      <p class="page-subtitle">3 минуты · бумага или холст</p>
    </header>
    <div v-if="error" role="alert">
      <p>{{ error }}</p>
      <button class="btn-outline" type="button" @click="load">Повторить</button>
    </div>
    <p v-else-if="!practice" class="muted" role="status">Загружаем практику…</p>
    <div v-else class="demo-layout">
      <section>
        <h2>Как выполнить</h2>
        <ol>
          <li v-for="step in practice.steps" :key="step">{{ step }}</li>
        </ol>
        <p>{{ practice.prompt }}</p>
        <RouterLink to="/practice-cards/two-lines">Карточка для печати</RouterLink>
      </section>
      <section class="demo-drawing">
        <h2>Холст</h2>
        <PracticeCanvas
          ref="canvas"
          :practice-id="practice.id"
          @changed="changed"
          @downloaded="dirty = false"
        />
        <p class="muted">
          Чтобы добавить рисунок в альбом, скачайте PNG и загрузите его после входа.
        </p>
        <RouterLink
          class="btn-outline"
          :to="{ name: 'login', query: { redirect: '/practice-album' } }"
        >
          Войти и открыть альбом
        </RouterLink>
      </section>
    </div>
  </main>
</template>

<style scoped>
.demo-page {
  max-inline-size: 62rem;
}
.demo-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  align-items: start;
  gap: var(--space-5);
}
.demo-layout ol {
  padding-inline-start: 1.4em;
}
.demo-layout li {
  margin-block-end: var(--space-2);
}
.demo-drawing {
  min-inline-size: 0;
  padding: clamp(1rem, 3vw, 2rem);
  border-radius: var(--radius);
  background: var(--bg-soft);
}
.demo-drawing :is(h2, p) {
  margin-block: 0 var(--space-3);
}
.demo-drawing p {
  margin-block-start: var(--space-3);
}
@media (max-width: 720px) {
  .demo-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
