<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import {
  captionLimit,
  newRequestId,
  practiceError,
  preparePaperPhoto,
  usePracticeApi,
  type DrawingFile,
  type Work,
} from './api';

const props = defineProps<{
  practiceId?: string;
  initialTitle?: string;
  readDrawing?: () => DrawingFile | undefined;
  drawingRevision?: number;
  prompt?: string;
  allowPhoto?: boolean;
}>();
const emit = defineEmits<{ saved: [work: Work, drawingRevision?: number] }>();
const { auth, capture, isCurrent, request } = usePracticeApi();
const title = ref(props.initialTitle ?? '');
const note = ref('');
const photo = ref<File>();
const fileInput = ref<HTMLInputElement>();
const busy = ref(false);
const error = ref('');
const prefix = useId();
const dirty = computed(() =>
  Boolean(note.value || photo.value || title.value !== (props.initialTitle ?? '')),
);
defineExpose({ dirty });
let requestId: string | undefined;
let operation = 0;
let disposed = false;

watch([title, note, photo, () => props.drawingRevision, () => props.allowPhoto], () => {
  requestId = undefined;
});
watch(
  () => auth.sessionRevision,
  () => {
    operation++;
    busy.value = false;
  },
  { flush: 'sync' },
);
watch(
  () => auth.user?.id,
  () => {
    title.value = props.initialTitle ?? '';
    note.value = '';
    photo.value = undefined;
    error.value = '';
    busy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  disposed = true;
});

async function save() {
  if (busy.value) return;
  const session = capture();
  const attempt = ++operation;
  const chosenPhoto = props.allowPhoto === false ? undefined : photo.value;
  const drawingRevision = chosenPhoto ? undefined : props.drawingRevision;
  busy.value = true;
  error.value = '';
  try {
    const image = chosenPhoto ? await preparePaperPhoto(chosenPhoto) : props.readDrawing?.();
    if (disposed || !isCurrent(session)) return;
    if (!image && !note.value.trim()) {
      error.value = 'Добавьте фото, рисунок или подпись.';
      return;
    }
    requestId ??= newRequestId();
    const work = await request<Work>(session, '/practices/works', {
      method: 'POST',
      data: {
        id: requestId,
        practiceId: props.practiceId,
        title: title.value,
        note: note.value,
        image,
      },
    });
    if (disposed || !isCurrent(session)) return;
    requestId = undefined;
    title.value = props.initialTitle ?? '';
    note.value = '';
    if (chosenPhoto) {
      photo.value = undefined;
      if (fileInput.value) fileInput.value.value = '';
    }
    emit('saved', work, image ? drawingRevision : undefined);
  } catch (reason) {
    if (!disposed && isCurrent(session))
      error.value = practiceError(
        reason,
        reason instanceof Error && chosenPhoto && !requestId
          ? reason.message
          : 'Не удалось сохранить работу. Повторите попытку.',
      );
  } finally {
    if (operation === attempt) busy.value = false;
  }
}
</script>

<template>
  <form class="stack work-form" @submit.prevent="save">
    <fieldset :disabled="busy" class="stack work-fields">
      <legend>Сохранить в личный альбом</legend>
      <div class="field">
        <label :for="`${prefix}-title`">Название</label>
        <input :id="`${prefix}-title`" v-model="title" required maxlength="100" />
      </div>
      <div class="field">
        <label :for="`${prefix}-note`">Подпись к работе</label>
        <p v-if="prompt" :id="`${prefix}-prompt`" class="muted">{{ prompt }}</p>
        <textarea
          :id="`${prefix}-note`"
          v-model="note"
          rows="3"
          :maxlength="captionLimit"
          :aria-describedby="prompt ? `${prefix}-prompt` : undefined"
        />
      </div>
      <div v-show="allowPhoto !== false" class="field">
        <label :for="`${prefix}-photo`">Фото работы на бумаге</label>
        <input
          :id="`${prefix}-photo`"
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="photo = ($event.target as HTMLInputElement).files?.[0]"
        />
      </div>
      <p class="muted work-meta">Работа и подписи сохраняются в личном альбоме без обработки ИИ.</p>
      <button class="btn-primary">{{ busy ? 'Сохраняем…' : 'Сохранить работу' }}</button>
    </fieldset>
    <p v-if="error" class="work-error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.work-form,
.work-fields {
  min-inline-size: 0;
}
.work-fields {
  border: none;
  padding: 0;
  margin: 0;
  gap: var(--space-4);
}
.work-fields legend {
  font-weight: 650;
  font-size: var(--text-xl);
  margin-block-end: var(--space-3);
}
.work-fields button {
  justify-self: start;
  align-self: start;
}
.work-fields input[type='file'] {
  max-width: 100%;
}
.work-meta,
.work-error {
  margin: 0;
}
.work-error {
  color: var(--danger-text);
}
</style>
