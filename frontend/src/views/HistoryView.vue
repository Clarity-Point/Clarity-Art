<template>
  <div class="page page-narrow stack">
    <h1 class="page-title display">Вся история</h1>
    <form class="card stack" @submit.prevent="load(false)">
      <label for="history-kind">Раздел</label>
      <select id="history-kind" v-model="kind">
        <option value="diary">Дневник</option>
        <option value="images">Рисунки</option>
        <option value="chats">Беседы</option>
        <option value="homework">Домашние задания</option>
      </select>
      <label>Поиск по тексту<input v-model="query" type="search" maxlength="200" /></label>
      <div class="date-fields">
        <label>С даты<input v-model="from" type="date" /></label
        ><label>По дату включительно<input v-model="to" type="date" /></label>
      </div>
      <button class="btn-primary" :disabled="loading">Найти</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p role="status">
      {{
        loading
          ? 'Загружаем историю…'
          : items.length
            ? `Загружено записей: ${items.length}`
            : 'По этим условиям записей нет.'
      }}
    </p>
    <article v-for="item in items" :key="item.id" class="card history-item">
      <h2>{{ item.title }}</h2>
      <time :datetime="item.date">{{ new Date(item.date).toLocaleString('ru-RU') }}</time>
      <img v-if="item.imageUrl" :src="item.imageUrl" alt="Ваш рисунок" loading="lazy" />
      <p>{{ item.text }}</p>
      <RouterLink :to="item.href">Открыть запись</RouterLink>
    </article>
    <button v-if="cursor" class="btn-outline" :disabled="loading" @click="load(true)">
      Загрузить ещё
    </button>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import axios from 'axios';
const route = useRoute();
const kinds = ['diary', 'images', 'chats', 'homework'];
const kind = ref(kinds.includes(String(route.query.kind)) ? String(route.query.kind) : 'diary');
const query = ref('');
const from = ref('');
const to = ref('');
const loading = ref(false);
const error = ref('');
const cursor = ref<string | null>(null);
interface Item {
  id: string;
  title: string;
  text: string;
  date: string;
  href: string;
  imageUrl?: string;
}
const items = ref<Item[]>([]);
let filters: Record<string, string> = {};
async function load(more = false) {
  if (loading.value) return;
  error.value = '';
  if (!more) {
    if (from.value && to.value && from.value > to.value) {
      error.value = 'Проверьте порядок дат.';
      return;
    }
    filters = { kind: kind.value, q: query.value };
    if (from.value) filters.from = new Date(`${from.value}T00:00:00`).toISOString();
    if (to.value) {
      const end = new Date(`${to.value}T00:00:00`);
      end.setDate(end.getDate() + 1);
      filters.to = end.toISOString();
    }
    items.value = [];
    cursor.value = null;
  }
  loading.value = true;
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL || '/api'}/history`, {
      params: { ...filters, ...(more ? { cursor: cursor.value } : {}) },
    });
    items.value.push(...(data.items || []));
    cursor.value = data.nextCursor || null;
  } catch {
    error.value = 'Не удалось загрузить историю. Повторите поиск.';
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());
</script>
<style scoped>
.date-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.history-item {
  overflow-wrap: anywhere;
}
.history-item p {
  white-space: pre-wrap;
}
.history-item img {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}
.history-item h2 {
  font-size: var(--text-lg);
}
@media (max-width: 420px) {
  .date-fields {
    grid-template-columns: 1fr;
  }
}
</style>
