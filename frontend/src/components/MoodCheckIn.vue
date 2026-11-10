<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import SimpleLineChart from './SimpleLineChart.vue';
const API = import.meta.env.VITE_API_URL || '/api';
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const labels = ['Очень тяжело', 'Тяжело', 'Ровно', 'Хорошо', 'Очень хорошо'];
interface CheckIn {
  id: string;
  day: string;
  score: number;
  note: string;
}
const items = ref<CheckIn[]>([]);
const score = ref(3);
const note = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const cursor = ref<string | null>(null);
const todayItem = computed(() => items.value.find((item) => item.day.slice(0, 10) === today));
const load = async (more = false) => {
  loading.value = true;
  error.value = '';
  try {
    const response = await axios.get(`${API}/mood-checkins`, {
      params: more ? { cursor: cursor.value } : {},
    });
    items.value = more
      ? [...items.value, ...(response.data.items || [])]
      : response.data.items || [];
    cursor.value = response.data.nextCursor;
    if (!more && todayItem.value) {
      score.value = todayItem.value.score;
      note.value = todayItem.value.note;
    }
  } catch {
    error.value = 'Не удалось загрузить ваши отметки. Повторите загрузку.';
  } finally {
    loading.value = false;
  }
};
const save = async () => {
  if (saving.value || loading.value) return;
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const response = await axios.put(`${API}/mood-checkins`, {
      day: today,
      score: score.value,
      note: note.value,
    });
    items.value = [response.data, ...items.value.filter((item) => item.id !== response.data.id)];
    message.value = 'Ваша отметка сохранена. Её можно изменить в течение дня.';
  } catch {
    error.value = 'Не удалось сохранить отметку. Повторите попытку.';
  } finally {
    saving.value = false;
  }
};
const remove = async (id: string) => {
  if (!window.confirm('Удалить эту отметку настроения?')) return;
  try {
    await axios.delete(`${API}/mood-checkins/${id}`);
    items.value = items.value.filter((item) => item.id !== id);
    message.value = 'Отметка удалена.';
  } catch {
    error.value = 'Не удалось удалить отметку.';
  }
};
onMounted(() => load());
</script>
<template>
  <section class="card mood-checkin">
    <h2 class="section-title">Как вы себя чувствуете сегодня?</h2>
    <p class="muted">
      Необязательная отметка своими словами. Это ваше наблюдение, отдельно от анализа ИИ.
    </p>
    <form @submit.prevent="save">
      <fieldset :disabled="loading || saving">
        <legend>Ваше состояние</legend>
        <div class="row wrap">
          <button
            v-for="(label, index) in labels"
            :key="label"
            type="button"
            :aria-pressed="score === index + 1"
            :class="score === index + 1 ? 'btn-primary' : 'btn-outline'"
            @click="score = index + 1"
          >
            {{ label }}
          </button>
        </div>
        <label for="mood-note">Что помогло или повлияло на ваше состояние?</label>
        <textarea
          id="mood-note"
          v-model="note"
          maxlength="1000"
          rows="2"
          placeholder="Можно оставить пустым"
        ></textarea>
        <button type="submit" class="btn-primary">
          {{ saving ? 'Сохраняем…' : todayItem ? 'Обновить отметку' : 'Сохранить отметку' }}
        </button>
      </fieldset>
    </form>
    <p role="status">{{ message }}</p>
    <div v-if="error">
      <p role="alert" class="mood-error">{{ error }}</p>
      <button type="button" class="btn-outline btn-sm" @click="load()">Повторить загрузку</button>
    </div>
    <SimpleLineChart
      v-if="items.length > 1"
      :points="
        items
          .slice(0, 30)
          .map((item) => ({ x: item.day.slice(0, 10), y: item.score }))
          .reverse()
      "
      :min-y="1"
      :max-y="5"
      aria-label="Ваши отметки состояния для последних 30 записей, от 1 — очень тяжело до 5 — очень хорошо"
    />
    <details v-if="items.length">
      <summary>Мои предыдущие отметки ({{ items.length }})</summary>
      <ul class="mood-history">
        <li v-for="item in items" :key="item.id">
          <b>{{ item.day.slice(0, 10) }} — {{ labels[item.score - 1] }}</b>
          <p v-if="item.note">{{ item.note }}</p>
          <button type="button" class="btn-outline btn-sm" @click="remove(item.id)">
            Удалить отметку от {{ item.day.slice(0, 10) }}
          </button>
        </li>
      </ul>
      <button v-if="cursor" type="button" :disabled="loading" @click="load(true)">
        {{ loading ? 'Загружаем…' : 'Загрузить предыдущие отметки' }}
      </button>
    </details>
  </section>
</template>
<style scoped>
.wrap {
  flex-wrap: wrap;
}
.mood-checkin {
  margin-bottom: var(--space-5);
}
fieldset {
  border: 0;
  padding: 0;
  margin: var(--space-4) 0;
  min-width: 0;
}
legend {
  font-weight: 600;
  margin-bottom: var(--space-2);
}
label {
  margin-top: var(--space-4);
}
textarea {
  margin-bottom: var(--space-3);
}
summary {
  cursor: pointer;
  padding: var(--space-3) 0;
}
.mood-history {
  list-style: none;
  padding: 0;
}
li {
  border-top: 1px solid var(--border-color);
  padding: var(--space-3) 0;
}
p {
  white-space: pre-wrap;
}
.mood-error {
  color: var(--danger-text);
}
</style>
