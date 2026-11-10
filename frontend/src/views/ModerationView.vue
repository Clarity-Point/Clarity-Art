<template>
  <div class="page page-narrow stack">
    <h1 class="page-title">Модерация галереи</h1>
    <label for="report-status">Статус</label>
    <select id="report-status" :disabled="busy" v-model="status" @change="load(false)">
      <option value="PENDING">Ожидают решения</option>
      <option value="ACTIONED">Публикация заблокирована</option>
      <option value="DISMISSED">Жалоба отклонена</option>
    </select>
    <p v-if="error" role="alert">
      {{ error }} <button class="btn-outline" @click="load(false)">Повторить</button>
    </p>
    <p role="status">
      {{
        busy
          ? 'Загружаем…'
          : items.length
            ? `Жалоб: ${items.length}`
            : 'Жалоб с таким статусом нет.'
      }}
    </p>
    <article v-for="item in items" :key="item.id" class="card stack">
      <h2>{{ item.image.prompt }}</h2>
      <p>
        {{ reasons[item.reason] || item.reason }} ·
        {{ new Date(item.createdAt).toLocaleString('ru-RU') }}
      </p>
      <p>{{ item.detail }}</p>
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        alt="Публикация, на которую поступила жалоба"
        loading="lazy"
      />
      <details>
        <summary>Текст публикации</summary>
        <p>{{ item.image.result }}</p>
      </details>
      <div v-if="item.status === 'PENDING'" class="row actions">
        <button class="btn-primary" :disabled="busy" @click="act(item, 'hide')">
          Заблокировать публикацию</button
        ><button class="btn-outline" :disabled="busy" @click="act(item, 'dismiss')">
          Отклонить жалобу
        </button>
      </div>
      <button
        v-else-if="item.image.moderationStatus === 'BLOCKED'"
        class="btn-outline"
        :disabled="busy"
        @click="restore(item)"
      >
        Восстановить публикацию
      </button>
    </article>
    <button v-if="cursor" class="btn-outline" :disabled="busy" @click="load(true)">
      Загрузить ещё
    </button>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
interface Report {
  id: string;
  imageId: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: string;
  imageUrl?: string;
  image: { prompt: string; result: string; moderationStatus: string; moderationVersion: number };
}
const API = import.meta.env.VITE_API_URL || '/api';
const items = ref<Report[]>([]),
  status = ref('PENDING'),
  cursor = ref<string | null>(null),
  busy = ref(false),
  error = ref('');
const reasons: Record<string, string> = {
  privacy: 'Нарушение приватности',
  harassment: 'Оскорбление или травля',
  unsafe: 'Опасный контент',
  spam: 'Спам',
  other: 'Другая причина',
};
async function load(more = false) {
  busy.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(`${API}/admin/reports`, {
      params: { status: status.value, ...(more ? { cursor: cursor.value } : {}) },
    });
    items.value = more ? [...items.value, ...data.items] : data.items || [];
    cursor.value = data.nextCursor;
  } catch {
    error.value = 'Не удалось загрузить жалобы.';
  } finally {
    busy.value = false;
  }
}
async function act(item: Report, action: string) {
  if (busy.value) return;
  if (action === 'hide' && !window.confirm('Заблокировать эту публикацию для всех участников?'))
    return;
  busy.value = true;
  try {
    await axios.post(`${API}/admin/reports/${item.id}/resolve`, {
      action,
      version: item.image.moderationVersion,
    });
    await load();
  } catch {
    error.value = 'Не удалось сохранить решение. Обновите список.';
  } finally {
    busy.value = false;
  }
}
async function restore(item: Report) {
  if (busy.value) return;
  busy.value = true;
  try {
    await axios.post(`${API}/admin/gallery/${item.imageId}/restore`, {
      version: item.image.moderationVersion,
    });
    await load();
  } catch (cause) {
    error.value =
      axios.isAxiosError(cause) && cause.response?.status === 409
        ? 'Публикация изменена другим модератором. Обновите список.'
        : 'Не удалось восстановить публикацию.';
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
</script>
<style scoped>
img {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
}
article {
  overflow-wrap: anywhere;
}
.actions {
  flex-wrap: wrap;
}
h2 {
  font-size: var(--text-lg);
}
details p {
  white-space: pre-wrap;
}
</style>
