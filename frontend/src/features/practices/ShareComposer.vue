<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import axios from 'axios';
import PracticeImage from './PracticeImage.vue';
import {
  newRequestId,
  practiceDate,
  practiceError,
  specialistLabel,
  usePracticeApi,
  type ShareChoice,
  type Specialist,
  type Work,
} from './api';

const props = defineProps<{ works: Work[] }>();
const emit = defineEmits<{ shared: []; close: [] }>();
const { auth, capture, isCurrent, request } = usePracticeApi();
const ownerId = auth.user?.id;
const specialists = ref<Specialist[]>();
const recipient = ref('');
const allowRecommendation = ref(false);
const selection = ref<Record<string, ShareChoice>>({});
const error = ref('');
const busy = ref(false);
const uncertain = ref(false);
const preview = ref<{
  id: string;
  therapistId: string;
  allowRecommendation: boolean;
  items: ShareChoice[];
}>();
const previewHeading = ref<HTMLElement>();
const selectHeading = ref<HTMLElement>();
defineExpose({ focus: () => selectHeading.value?.focus() });
const chosen = computed(() => props.works.filter((work) => selection.value[work.id]));
const byId = computed(() => new Map(props.works.map((work) => [work.id, work])));
const selectedSpecialist = computed(() =>
  specialists.value?.find((person) => person.id === preview.value?.therapistId),
);
let disposed = false;

async function loadSpecialists() {
  const session = capture();
  if (!session.id || session.id !== ownerId) return;
  error.value = '';
  try {
    const people = await request<Specialist[]>(session, '/therapists');
    if (!disposed) specialists.value = people.filter((person) => person.id !== session.id);
  } catch (reason) {
    if (!disposed && isCurrent(session))
      error.value = practiceError(reason, 'Не удалось загрузить список специалистов.');
  }
}
watch(
  () => auth.sessionRevision,
  () => {
    if (!specialists.value) void loadSpecialists();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
});

function setWork(work: Work, selected: boolean) {
  error.value = '';
  if (!selected) delete selection.value[work.id];
  else if (chosen.value.length < 8) {
    selection.value[work.id] = {
      workId: work.id,
      includeImage: false,
      includeNote: false,
      reflectionIds: [],
    };
  }
}

async function showPreview() {
  error.value = '';
  const items = chosen.value.map((work) => selection.value[work.id]);
  if (
    !recipient.value ||
    !items.length ||
    items.some((item) => !item.includeImage && !item.includeNote && !item.reflectionIds.length)
  ) {
    error.value = 'Выберите специалиста и отметьте рисунок или подпись в каждой работе.';
    return;
  }
  preview.value = {
    id: newRequestId(),
    therapistId: recipient.value,
    allowRecommendation: allowRecommendation.value,
    items: items.map((item) => ({ ...item, reflectionIds: [...item.reflectionIds] })),
  };
  await nextTick();
  previewHeading.value?.focus();
}

async function edit() {
  preview.value = undefined;
  error.value = '';
  await nextTick();
  selectHeading.value?.focus();
}

async function send() {
  if (!preview.value || busy.value) return;
  const session = capture();
  if (!session.id || session.id !== ownerId) return;
  busy.value = true;
  error.value = '';
  try {
    await request(session, '/practices/shares', { method: 'POST', data: preview.value });
    if (!disposed && isCurrent(session)) emit('shared');
  } catch (reason) {
    if (!disposed && session.id === auth.user?.id) {
      const status = axios.isAxiosError(reason) ? reason.response?.status : undefined;
      if (status === 410) {
        uncertain.value = false;
        error.value = 'Подборка уже отозвана. Измените выбор, чтобы создать новую.';
      } else {
        uncertain.value ||= !status || status >= 500;
        error.value = uncertain.value
          ? 'Не удалось подтвердить отправку. Повторите её или проверьте отправленные подборки.'
          : practiceError(reason, 'Не удалось отправить подборку. Повторите попытку.');
      }
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="share-composer" aria-labelledby="share-heading">
    <template v-if="preview">
      <h2 id="share-heading" ref="previewHeading" tabindex="-1">Что увидит специалист</h2>
      <p v-if="selectedSpecialist">Получатель — {{ specialistLabel(selectedSpecialist) }}.</p>
      <div class="preview-list">
        <article v-for="item in preview.items" :key="item.workId">
          <h3>{{ byId.get(item.workId)?.title }}</h3>
          <PracticeImage
            v-if="item.includeImage"
            :path="`/practices/works/${item.workId}/image`"
            :title="byId.get(item.workId)?.title ?? ''"
          />
          <p v-if="item.includeNote" class="caption">{{ byId.get(item.workId)?.note }}</p>
          <template v-for="reflection in byId.get(item.workId)?.reflections" :key="reflection.id">
            <p v-if="item.reflectionIds.includes(reflection.id)" class="caption">
              <time :datetime="reflection.createdAt">{{ practiceDate(reflection.createdAt) }}</time>
              {{ reflection.content }}
            </p>
          </template>
        </article>
      </div>
      <p v-if="preview.allowRecommendation">Специалист сможет предложить одну практику.</p>
      <p class="muted">Доступ к подборке можно отозвать в альбоме.</p>
      <div class="share-actions">
        <button type="button" class="btn-primary" :disabled="busy" @click="send">
          {{ busy ? 'Отправляем…' : 'Поделиться подборкой' }}
        </button>
        <button
          v-if="uncertain"
          type="button"
          class="btn-outline"
          :disabled="busy"
          @click="emit('close')"
        >
          Проверить в альбоме
        </button>
        <button v-else type="button" class="btn-outline" :disabled="busy" @click="edit">
          Изменить выбор
        </button>
      </div>
    </template>

    <form v-else class="stack" @submit.prevent="showPreview">
      <h2 id="share-heading" ref="selectHeading" tabindex="-1">Подборка к встрече</h2>
      <div v-if="specialists?.length" class="field">
        <label for="practice-recipient">Специалист</label>
        <select id="practice-recipient" v-model="recipient" required>
          <option value="" disabled>Выберите специалиста</option>
          <option v-for="person in specialists" :key="person.id" :value="person.id">
            {{ specialistLabel(person) }}
          </option>
        </select>
        <p class="muted">Сверьте код с получателем перед отправкой.</p>
      </div>
      <p v-else-if="specialists" role="status">В приложении пока нет доступных специалистов.</p>
      <p v-else-if="!error" role="status">Загружаем специалистов…</p>
      <button v-else type="button" class="btn-outline" @click="loadSpecialists">
        Повторить загрузку
      </button>

      <label class="share-recommendation">
        <input v-model="allowRecommendation" type="checkbox" /> Разрешить предложить практику
      </label>
      <fieldset class="share-works">
        <legend>Работы для встречи ({{ chosen.length }} из 8)</legend>
        <div v-for="work in works" :key="work.id" class="work-selection">
          <label>
            <input
              type="checkbox"
              :checked="Boolean(selection[work.id])"
              :disabled="!selection[work.id] && chosen.length >= 8"
              @change="setWork(work, ($event.target as HTMLInputElement).checked)"
            />
            {{ work.title }} · {{ practiceDate(work.createdAt) }}
          </label>
          <fieldset v-if="selection[work.id]" class="content-selection">
            <legend class="sr-only">Содержимое работы «{{ work.title }}»</legend>
            <label v-if="work.hasImage"
              ><input v-model="selection[work.id].includeImage" type="checkbox" /> Рисунок</label
            >
            <label v-if="work.note"
              ><input v-model="selection[work.id].includeNote" type="checkbox" /> Исходная
              подпись</label
            >
            <label v-for="reflection in work.reflections" :key="reflection.id">
              <input
                v-model="selection[work.id].reflectionIds"
                type="checkbox"
                :value="reflection.id"
              />
              Подпись от {{ practiceDate(reflection.createdAt) }} — {{ reflection.content }}
            </label>
          </fieldset>
        </div>
      </fieldset>
      <div class="share-actions">
        <button class="btn-primary" :disabled="!specialists?.length">Проверить подборку</button>
        <button type="button" class="btn-outline" @click="emit('close')">Отмена</button>
      </div>
    </form>
    <p v-if="error" class="share-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.share-recommendation {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.share-composer {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.share-works,
.content-selection {
  margin: 0;
  padding: 0;
  border: 0;
  min-inline-size: 0;
}
.share-works legend {
  margin-block-end: var(--space-2);
  font-weight: 650;
}
.work-selection {
  border-block-start: 1px solid var(--border-color);
  padding-block: var(--space-2);
}
.work-selection label {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-height: 2.75rem;
  padding-block: var(--space-2);
}
.work-selection input {
  width: auto;
  flex: none;
}
.content-selection {
  padding-inline-start: var(--space-5);
}
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.preview-list {
  display: grid;
  gap: var(--space-4);
  margin-block: var(--space-4);
}
.preview-list article {
  padding-block: var(--space-4);
  border-block-start: 1px solid var(--border-color);
}
.caption {
  white-space: pre-wrap;
  margin-block: var(--space-3);
}
.caption time {
  display: block;
  color: var(--muted-text);
  font-size: var(--text-sm);
}
.share-error {
  color: var(--danger-text);
  margin-block-start: var(--space-3);
}
</style>
