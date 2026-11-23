<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { getCatalog, practiceError, type Catalog } from '@/features/practices/api';

const route = useRoute();
const catalog = ref<Catalog>();
const error = ref('');
const cards = computed(() => {
  const all = catalog.value?.practices ?? [];
  return route.params.practiceId ? all.filter((item) => item.id === route.params.practiceId) : all;
});
async function load() {
  error.value = '';
  try {
    catalog.value = await getCatalog();
  } catch (reason) {
    error.value = practiceError(reason, 'Не удалось загрузить карточки.');
  }
}
function print() {
  window.print();
}
watch(
  () => [route.params.practiceId, Boolean(catalog.value)],
  async () => {
    if (!catalog.value) return;
    await nextTick();
    document.getElementById('print-page-title')?.focus();
  },
);
onMounted(load);
</script>

<template>
  <main class="page print-page">
    <header class="page-head print-toolbar">
      <div>
        <h1 id="print-page-title" class="page-title display" tabindex="-1">Карточки для печати</h1>
        <p class="page-subtitle">Каждое упражнение помещается на отдельном листе A4.</p>
      </div>
      <div class="print-actions">
        <button v-if="cards.length" class="btn-primary" type="button" @click="print">
          <Icon name="file-text" :size="17" />
          {{ route.params.practiceId ? 'Печатать карточку' : 'Печатать все карточки' }}
        </button>
        <RouterLink
          v-if="route.params.practiceId"
          class="btn-outline"
          :to="{ name: 'practice-cards', params: { practiceId: '' } }"
        >
          Все карточки
        </RouterLink>
        <RouterLink
          v-if="cards.some(({ id }) => id === 'two-lines')"
          class="btn-outline"
          to="/practice-demo"
          >Попробовать на холсте</RouterLink
        >
        <RouterLink class="btn-outline" to="/practices">В приложение</RouterLink>
      </div>
    </header>
    <p v-if="error" role="alert" class="print-toolbar">
      {{ error }} <button type="button" class="btn-outline" @click="load">Повторить</button>
    </p>
    <p v-else-if="!catalog" class="print-toolbar muted" role="status">Загружаем карточки…</p>
    <p v-else-if="!cards.length" class="print-toolbar" role="status">Такой карточки нет.</p>
    <div class="print-deck">
      <article v-for="card in cards" :key="card.id" class="print-card">
        <header>
          <h2>{{ card.title }}</h2>
          <p>{{ card.minutes }} мин · {{ card.supplies }}</p>
        </header>
        <ol>
          <li v-for="step in card.steps" :key="step">{{ step }}</li>
        </ol>
        <p class="print-prompt">{{ card.prompt }}</p>
        <RouterLink
          v-if="!route.params.practiceId"
          class="single-card"
          :to="{ name: 'practice-cards', params: { practiceId: card.id } }"
        >
          Подготовить карточку к печати
        </RouterLink>
      </article>
    </div>
  </main>
</template>

<style scoped>
.print-toolbar {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.print-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--space-2);
}
.print-deck {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.print-card {
  min-inline-size: 0;
  padding: clamp(1rem, 3vw, 2rem);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}
.print-card header {
  border-bottom: 1px solid var(--border-color);
}
.print-card ol {
  display: grid;
  gap: var(--space-2);
  padding-inline-start: 1.4em;
  margin-block: var(--space-4);
}
.print-prompt {
  font-weight: 650;
}
.single-card {
  display: inline-block;
  margin-block-start: var(--space-2);
}
@media (max-width: 720px) {
  .print-deck {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media print {
  @page {
    size: A4;
    margin: 18mm;
  }
  .print-toolbar,
  .single-card {
    display: none;
  }
  .print-page {
    display: block;
    margin: 0;
    padding: 0;
    color: #171717;
    background: white;
  }
  .print-deck {
    display: block;
  }
  .print-card {
    color: #171717;
    background: white;
    border: 0;
    border-radius: 0;
    padding: 0;
    break-inside: avoid;
  }
  .print-card:not(:last-child) {
    break-after: page;
  }
  .print-card h2 {
    font-size: 26pt;
    color: #171717;
  }
  .print-card header {
    border-color: #999;
  }
  .print-card li,
  .print-card p {
    font-size: 12pt;
  }
}
</style>
