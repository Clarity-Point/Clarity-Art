<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import Icon from '@/components/Icon.vue';
import PracticeCanvas from './PracticeCanvas.vue';
import { usePracticeDraft } from './usePracticeDraft';
import {
  captionLimit,
  practiceError,
  preparePaperPhoto,
  usePracticeApi,
  type Practice,
} from './api';

const props = defineProps<{
  practice: Practice;
  completed: boolean;
  next?: Practice;
  seriesId?: string;
}>();
const emit = defineEmits<{ completed: [practiceId: string] }>();
const { capture, isCurrent, request } = usePracticeApi();
const canvas = ref<InstanceType<typeof PracticeCanvas>>();
const prefix = useId();
const busy = ref(false);
const status = ref('');
const workSaved = ref(false);
const error = ref('');
const photoError = ref('');
const photoBusy = ref(false);
let disposed = false;
const {
  snapshot,
  ready,
  syncing,
  committed,
  finalizing,
  dirty,
  error: draftError,
  attachmentError,
  conflict,
  finalAttempt,
  edit,
  flush,
  finish,
  discard,
  load,
} = usePracticeDraft(
  props.practice.id,
  props.practice.title,
  async (image, signal) => {
    await canvas.value?.restore(image, signal);
  },
  () => canvas.value?.readDrawing(),
);
const locked = computed(
  () => !ready.value || finalizing.value || Boolean(finalAttempt.value) || photoBusy.value,
);
const mode = computed({
  get: () => snapshot.value.mode,
  set: (value: 'paper' | 'canvas') => edit({ mode: value }),
});
const preview = computed(() => {
  const image = snapshot.value.image;
  return image ? `data:${image.mimeType};base64,${image.base64}` : '';
});
const attachmentFilename = computed(() => {
  const type = snapshot.value.image?.mimeType;
  return `practice.${type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'}`;
});
const canFinalize = computed(
  () =>
    snapshot.value.title.trim() && (snapshot.value.attachmentKind || snapshot.value.note.trim()),
);

function changed(hasDrawing: boolean) {
  if (!hasDrawing && attachmentError.value) return;
  if (hasDrawing || snapshot.value.attachmentKind === 'canvas')
    edit({ image: null, attachmentKind: hasDrawing ? 'canvas' : null });
}
function allowDrawing() {
  return (
    snapshot.value.attachmentKind !== 'photo' ||
    window.confirm('Заменить фотографию рисунком на холсте?')
  );
}
async function choosePhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || locked.value) return;
  if (
    snapshot.value.attachmentKind === 'canvas' &&
    !window.confirm('Заменить рисунок на холсте выбранной фотографией?')
  )
    return;
  const session = capture();
  photoBusy.value = true;
  photoError.value = '';
  try {
    const image = await preparePaperPhoto(file);
    if (disposed || !isCurrent(session)) return;
    await canvas.value?.restore(null);
    edit({ image, attachmentKind: 'photo' });
  } catch (reason) {
    if (!disposed && isCurrent(session))
      photoError.value =
        reason instanceof Error ? reason.message : 'Не удалось подготовить фотографию.';
  } finally {
    photoBusy.value = false;
  }
}
function confirmDiscard() {
  if (window.confirm('Удалить черновик практики?')) void discard();
}
async function saveWork() {
  canvas.value?.commitStroke();
  if ((canFinalize.value || finalAttempt.value) && (await finish())) workSaved.value = true;
}
function confirmLeave() {
  canvas.value?.commitStroke();
  return (
    !(dirty.value || finalAttempt.value || photoBusy.value) ||
    window.confirm('Последние изменения ещё сохраняются. Уйти с практики?')
  );
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(
  (to, from) => to.params.practiceId === from.params.practiceId || confirmLeave(),
);
function beforeUnload(event: BeforeUnloadEvent) {
  canvas.value?.commitStroke();
  if (!dirty.value && !finalAttempt.value && !photoBusy.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('beforeunload', beforeUnload);
});

async function complete() {
  if (busy.value || props.completed) return;
  const session = capture();
  busy.value = true;
  error.value = '';
  try {
    await request(session, `/practices/progress/${props.practice.id}`, { method: 'PUT' });
    if (!disposed && isCurrent(session)) {
      emit('completed', props.practice.id);
      status.value = 'Практика отмечена как выполненная.';
    }
  } catch (reason) {
    if (!disposed && isCurrent(session))
      error.value = practiceError(reason, 'Не удалось отметить практику.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="session-layout">
    <section class="instruction" aria-labelledby="practice-instruction">
      <h2 id="practice-instruction">Как выполнить</h2>
      <ol class="steps">
        <li v-for="step in practice.steps" :key="step">{{ step }}</li>
      </ol>
      <p class="prompt">{{ practice.prompt }}</p>
      <div class="session-actions">
        <button
          v-if="!completed"
          class="btn-primary"
          type="button"
          :disabled="busy"
          @click="complete"
        >
          {{ busy ? 'Отмечаем…' : 'Завершить практику' }}
        </button>
        <p v-else class="completed"><Icon name="check" :size="18" /> Выполнено</p>
        <RouterLink
          v-if="next"
          class="btn-outline"
          :to="{ name: 'practices', params: { practiceId: next.id }, query: { series: seriesId } }"
        >
          Следующая практика
        </RouterLink>
      </div>
      <p class="sr-only" role="status">{{ status }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>

    <div class="canvas-column">
      <fieldset class="drawing-mode" :disabled="locked">
        <legend>Где рисовать</legend>
        <div class="mode-options">
          <label
            ><input v-model="mode" name="practice-drawing-mode" type="radio" value="paper" /> На
            бумаге</label
          >
          <label
            ><input v-model="mode" name="practice-drawing-mode" type="radio" value="canvas" /> На
            холсте</label
          >
        </div>
      </fieldset>
      <p v-if="mode === 'paper'" class="paper-copy">
        Подготовьте материалы и начните с первого шага. После практики можно добавить фото или
        подпись.
      </p>
      <PracticeCanvas
        v-show="mode === 'canvas'"
        ref="canvas"
        :practice-id="practice.id"
        :disabled="locked"
        :allow-drawing="allowDrawing"
        @changed="changed"
      />
      <p v-if="!ready && !draftError" class="muted" role="status">Загружаем черновик…</p>
      <p v-else-if="draftError" class="error" role="alert">{{ draftError }}</p>
      <p v-else-if="syncing || dirty || committed" class="muted" role="status">
        {{
          syncing ? 'Сохраняем черновик…' : dirty ? 'Черновик ждёт сохранения' : 'Черновик сохранён'
        }}
      </p>
      <button
        v-if="draftError && (!ready || conflict)"
        type="button"
        class="btn-outline"
        :disabled="photoBusy"
        @click="load"
      >
        {{ conflict ? 'Загрузить версию с сервера' : 'Загрузить снова' }}
      </button>
      <button
        v-else-if="draftError && dirty && !finalAttempt"
        type="button"
        class="btn-outline"
        @click="flush"
      >
        Повторить автосохранение
      </button>
      <details v-if="ready" class="save-details">
        <summary>Сохранить рисунок или заметку</summary>
        <p v-if="attachmentError" class="error" role="alert">{{ attachmentError }}</p>
        <form class="stack work-form" @submit.prevent="saveWork">
          <fieldset class="stack draft-fields" :disabled="locked">
            <legend>Данные работы</legend>
            <label :for="`${prefix}-title`">Название</label>
            <input
              :id="`${prefix}-title`"
              :value="snapshot.title"
              required
              maxlength="100"
              @input="edit({ title: ($event.target as HTMLInputElement).value })"
            />
            <label :for="`${prefix}-note`">Подпись к работе</label>
            <textarea
              :id="`${prefix}-note`"
              :value="snapshot.note"
              rows="3"
              :maxlength="captionLimit"
              @input="edit({ note: ($event.target as HTMLTextAreaElement).value })"
            />
            <template v-if="mode === 'paper'">
              <label :for="`${prefix}-photo`">Фото работы на бумаге</label>
              <input
                :id="`${prefix}-photo`"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="choosePhoto"
              />
            </template>
          </fieldset>
          <p v-if="photoError" class="error" role="alert">{{ photoError }}</p>
          <figure v-if="preview" class="draft-preview">
            <img
              :src="preview"
              :alt="snapshot.attachmentKind === 'photo' ? 'Фото работы' : 'Рисунок на холсте'"
            />
            <figcaption>Вложение для альбома</figcaption>
            <a class="btn-outline" :href="preview" :download="attachmentFilename">
              Скачать вложение
            </a>
          </figure>
          <div v-else-if="snapshot.attachmentKind === 'canvas'" class="draft-preview">
            <p>Вложение для альбома — рисунок на холсте.</p>
            <button type="button" class="btn-outline" @click="canvas?.download()">
              Скачать вложение
            </button>
          </div>
          <div class="session-actions">
            <button
              class="btn-primary"
              :disabled="
                (!canFinalize && !finalAttempt) ||
                conflict ||
                finalizing ||
                photoBusy ||
                Boolean(attachmentError)
              "
            >
              {{
                finalizing
                  ? 'Сохраняем…'
                  : finalAttempt
                    ? 'Проверить сохранение'
                    : 'Сохранить работу'
              }}
            </button>
            <button
              v-if="dirty || committed"
              type="button"
              class="btn-outline"
              :disabled="locked || conflict"
              @click="confirmDiscard"
            >
              Удалить черновик
            </button>
          </div>
        </form>
      </details>
      <p v-if="workSaved" class="saved-status" role="status">
        Работа сохранена в личном альбоме.
        <RouterLink to="/practice-album">Открыть альбом</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.session-layout {
  display: grid;
  gap: var(--space-6);
  align-items: start;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
}
.instruction {
  padding-block: var(--space-3);
}
.steps {
  display: grid;
  gap: var(--space-3);
  padding-inline-start: 1.4em;
}
.prompt {
  font-size: var(--text-lg);
  font-weight: 600;
}
.session-actions,
.mode-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.canvas-column {
  padding: clamp(1rem, 3vw, 2rem);
  border-radius: var(--radius);
  background: var(--bg-soft);
  min-inline-size: 0;
}
.drawing-mode {
  padding: 0;
  border: 0;
  margin: 0 0 var(--space-4);
}
.drawing-mode legend {
  font-weight: 650;
  padding: 0;
}
.mode-options label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-2);
}
.mode-options input {
  width: auto;
}
.draft-fields {
  border: 0;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
}
.draft-fields legend {
  font-weight: 650;
}
.draft-fields input[type='file'] {
  max-inline-size: 100%;
}
.draft-preview {
  margin: 0;
}
.draft-preview img {
  display: block;
  max-inline-size: 12rem;
  width: 100%;
  max-block-size: 10rem;
  object-fit: contain;
  background: white;
}
.save-details {
  border-top: 1px solid var(--border-color);
  margin-block-start: var(--space-5);
}
.save-details summary {
  cursor: pointer;
  padding-block: var(--space-3);
  font-weight: 650;
}
.error {
  color: var(--danger-text);
}
.completed {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
}
.saved-status {
  margin-block: var(--space-3) 0;
}
@media (max-width: 720px) {
  .session-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
