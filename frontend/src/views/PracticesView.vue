<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import PracticeSession from '@/features/practices/PracticeSession.vue';
import { useLatestPracticeDraft } from '@/features/practices/useLatestPracticeDraft';
import { getCatalog, practiceError, usePracticeApi, type Catalog } from '@/features/practices/api';

const route = useRoute();
const router = useRouter();
const intentions = computed(() => catalog.value?.intentions ?? []);
const intent = computed(() => intentions.value.find(({ id }) => route.query.intent === id));
const intentQuery = computed(() => (intent.value ? { intent: intent.value.id } : {}));
function setIntent(value: string) {
  void router.push({
    name: 'practices',
    params: { practiceId: '' },
    query: value ? { intent: value } : {},
  });
}
function reset() {
  duration.value = 0;
  material.value = '';
  if (intent.value) setIntent('');
}

const { auth, capture, isCurrent, request } = usePracticeApi(true);
const catalog = ref<Catalog>();
const completed = ref<string[]>([]);
const error = ref('');
const progressError = ref('');
const duration = ref(0);
const material = ref('');
const practices = computed(() => catalog.value?.practices ?? []);
const byId = computed(() => new Map(practices.value.map((practice) => [practice.id, practice])));
const activeId = computed(() =>
  typeof route.params.practiceId === 'string' ? route.params.practiceId : '',
);
const latest = useLatestPracticeDraft(() => !activeId.value);
const active = computed(() => byId.value.get(activeId.value));
const series = computed(() =>
  catalog.value?.series.find(
    (item) => item.id === route.query.series && item.practiceIds.includes(activeId.value),
  ),
);
const next = computed(() => {
  if (!series.value) return undefined;
  const nextId = series.value.practiceIds[series.value.practiceIds.indexOf(activeId.value) + 1];
  return byId.value.get(nextId);
});
const visible = computed(() =>
  practices.value.filter(
    (practice) =>
      (!intent.value || intent.value.practiceIds.includes(practice.id)) &&
      (!duration.value || practice.minutes <= duration.value) &&
      (!material.value || practice.material === material.value),
  ),
);

async function loadCatalog() {
  error.value = '';
  try {
    catalog.value = await getCatalog();
  } catch (reason) {
    error.value = practiceError(reason, 'Не удалось загрузить практики.');
  }
}

async function loadProgress() {
  const session = capture();
  if (!session.id) return;
  progressError.value = '';
  try {
    const saved = await request<string[]>(session, '/practices/progress');
    completed.value = [...new Set([...completed.value, ...saved])];
  } catch (reason) {
    if (isCurrent(session))
      progressError.value = practiceError(reason, 'Не удалось загрузить отметки.');
  }
}
function mark(id: string) {
  if (!completed.value.includes(id)) completed.value = [...completed.value, id];
}
watch(
  () => auth.user?.id,
  () => {
    completed.value = [];
    progressError.value = '';
    void loadProgress();
  },
  { immediate: true, flush: 'sync' },
);
onMounted(loadCatalog);
</script>

<template>
  <div class="page practice-page">
    <header class="page-head practice-head">
      <div>
        <RouterLink
          v-if="activeId"
          class="back-link"
          :to="{ name: 'practices', params: { practiceId: '' }, query: intentQuery }"
        >
          <Icon name="arrow-left" :size="17" /> Все практики
        </RouterLink>
        <h1 class="page-title display">{{ active?.title ?? 'Творческая пауза' }}</h1>
        <p class="page-subtitle">
          {{
            active
              ? `${active.minutes} мин · ${active.supplies}`
              : 'Выберите короткое упражнение для бумаги или холста.'
          }}
        </p>
      </div>
      <nav class="practice-links" aria-label="Практики">
        <RouterLink
          v-if="!activeId && latest"
          class="btn-primary"
          :to="{ name: 'practices', params: { practiceId: latest.practiceId } }"
        >
          Продолжить практику
        </RouterLink>
        <RouterLink class="btn-outline" to="/practice-album"
          ><Icon name="image" :size="17" /> Мой альбом</RouterLink
        >
        <RouterLink
          class="btn-outline"
          :to="{ name: 'practice-cards', params: active ? { practiceId: active.id } : {} }"
        >
          <Icon name="file-text" :size="17" />
          {{ active ? 'Карточка для печати' : 'Печатные карточки' }}
        </RouterLink>
      </nav>
    </header>

    <p v-if="progressError" role="status" class="muted">
      {{ progressError }}
      <button class="btn-outline" type="button" @click="loadProgress">Обновить отметки</button>
    </p>
    <div v-if="error" class="empty-state">
      <p role="alert">{{ error }}</p>
      <button type="button" class="btn-outline" @click="loadCatalog">Повторить</button>
    </div>
    <p v-else-if="!catalog" class="muted" role="status">Загружаем практики…</p>
    <PracticeSession
      v-else-if="active"
      :key="`${auth.user?.id}:${active.id}`"
      :practice="active"
      :completed="completed.includes(active.id)"
      :next="next"
      :series-id="series?.id"
      @completed="mark"
    />
    <p v-else-if="activeId" role="status">Такой карточки нет. Выберите практику из списка.</p>
    <template v-else>
      <section aria-labelledby="practice-catalog" class="catalog-section">
        <h2 id="practice-catalog">Одно упражнение</h2>
        <div class="catalog-filters">
          <div v-if="intentions.length" class="field">
            <label for="practice-intent">Чего хочется сейчас</label>
            <select
              id="practice-intent"
              :value="intent?.id ?? ''"
              @change="setIntent(($event.target as HTMLSelectElement).value)"
            >
              <option value="">Все намерения</option>
              <option v-for="item in intentions" :key="item.id" :value="item.id">
                {{ item.title }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="practice-duration">Сколько есть времени</label>
            <select id="practice-duration" v-model.number="duration">
              <option :value="0">Любое время</option>
              <option :value="3">До 3 минут</option>
              <option :value="5">До 5 минут</option>
              <option :value="7">До 7 минут</option>
              <option :value="10">До 10 минут</option>
            </select>
          </div>
          <div class="field">
            <label for="practice-material">Материалы</label>
            <select id="practice-material" v-model="material">
              <option value="">Любые материалы</option>
              <option value="pencil">Карандаш</option>
              <option value="color">Цвет</option>
              <option value="collage">Коллаж</option>
            </select>
          </div>
        </div>
        <p v-if="!visible.length" class="muted" role="status">
          <button class="btn-outline" type="button" @click="reset">Сбросить фильтры</button>
        </p>
        <ul v-else class="practice-list">
          <li v-for="practice in visible" :key="practice.id">
            <RouterLink
              class="practice-row"
              :to="{ name: 'practices', params: { practiceId: practice.id }, query: intentQuery }"
            >
              <span class="practice-time">{{ practice.minutes }} мин</span>
              <span>
                <strong>{{ practice.title }}</strong>
                <span class="muted practice-supplies">{{ practice.supplies }}</span>
              </span>
              <span v-if="completed.includes(practice.id)" class="practice-done"
                ><Icon name="check" :size="17" /><span class="sr-only">Выполнено</span></span
              >
              <Icon v-else name="arrow-right" :size="18" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section aria-labelledby="practice-series" class="series-section">
        <h2 id="practice-series">Серии практик</h2>
        <div class="series-list">
          <article v-for="item in catalog.series" :key="item.id" class="series">
            <h3>{{ item.title }}</h3>
            <ol class="series-steps">
              <li v-for="id in item.practiceIds" :key="id">
                <RouterLink
                  :to="{
                    name: 'practices',
                    params: { practiceId: id },
                    query: { series: item.id },
                  }"
                >
                  {{ byId.get(id)?.title }}
                  <Icon v-if="completed.includes(id)" name="check" :size="16" />
                  <span v-if="completed.includes(id)" class="sr-only">Выполнено</span>
                </RouterLink>
              </li>
            </ol>
            <p class="muted">
              {{ item.practiceIds.filter((id) => completed.includes(id)).length }} из
              {{ item.practiceIds.length }} выполнено
            </p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.practice-head,
.practice-links,
.catalog-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: start;
}
.practice-head {
  justify-content: space-between;
}
.practice-links {
  margin-block: var(--space-1);
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-end: var(--space-3);
}
.catalog-section,
.series-section {
  margin-block: var(--space-5);
}
.catalog-filters > div {
  flex: 1 1 13rem;
  max-inline-size: 20rem;
}
.practice-list {
  padding: 0;
  list-style: none;
  border-block-start: 1px solid var(--border-color);
}
.practice-row {
  display: grid;
  grid-template-columns: minmax(3.2rem, auto) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border-block-end: 1px solid var(--border-color);
  padding: var(--space-3);
  color: var(--text-color);
  text-decoration: none;
}
.practice-row:hover {
  background: var(--bg-soft);
}
.practice-row strong {
  display: block;
  font-size: var(--text-lg);
}
.practice-supplies {
  display: block;
}
.practice-time {
  font-variant-numeric: tabular-nums;
  color: var(--accent-color);
}
.practice-done {
  color: var(--success-text);
}
.series-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.series {
  background: var(--bg-soft);
  border-radius: var(--radius);
  padding: var(--space-4);
}
.series-steps {
  padding-inline-start: 1.4em;
}
.series-steps a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-1);
}
.series > p {
  margin-block-end: 0;
}
@media (max-width: 620px) {
  .series-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
