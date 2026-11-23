<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useCanvasDrawing } from '@/composables/useCanvasDrawing';
import Icon from '@/components/Icon.vue';
import SaveWorkForm from './SaveWorkForm.vue';
import { asDrawing, practiceError, usePracticeApi, type Practice } from './api';

const props = defineProps<{
  practice: Practice;
  completed: boolean;
  next?: Practice;
  seriesId?: string;
}>();
const emit = defineEmits<{ completed: [practiceId: string] }>();
const { capture, isCurrent, request } = usePracticeApi();
const mode = ref<'paper' | 'canvas'>('paper');
const workForm = ref<InstanceType<typeof SaveWorkForm>>();
const busy = ref(false);
const status = ref('');
const workSaved = ref(false);
const error = ref('');
const drawingRevision = ref(0);
const savedRevision = ref(0);
const {
  drawingCanvasRef,
  currentColor,
  currentTool,
  isCanvasEmpty,
  setTool,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleMouseLeave,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  clearCanvasSurface,
} = useCanvasDrawing({
  tapToFullscreen: false,
  onChange: () => {
    drawingRevision.value++;
  },
});
const dirty = computed(
  () =>
    Boolean(workForm.value?.dirty) ||
    (drawingRevision.value !== savedRevision.value && !isCanvasEmpty.value),
);
let disposed = false;

function readDrawing() {
  if (mode.value !== 'canvas' || !drawingCanvasRef.value || isCanvasEmpty.value) return undefined;
  return asDrawing(drawingCanvasRef.value.toDataURL('image/png'));
}

function download() {
  const canvas = drawingCanvasRef.value;
  if (!canvas || isCanvasEmpty.value) return;
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${props.practice.id}.png`;
  link.click();
}

function saved(_work: unknown, revision?: number) {
  if (revision !== undefined) savedRevision.value = revision;
  workSaved.value = true;
}
function confirmLeave() {
  return (
    !dirty.value ||
    window.confirm('Уйти с практики? Рисунок и подпись останутся только после сохранения в альбом.')
  );
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(
  (to, from) => to.params.practiceId === from.params.practiceId || confirmLeave(),
);
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
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
      <fieldset class="drawing-mode">
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
      <div v-show="mode === 'canvas'" class="canvas-area">
        <div class="canvas-tools">
          <label for="practice-ink">Цвет</label>
          <input id="practice-ink" v-model="currentColor" type="color" />
          <button
            class="btn-outline"
            type="button"
            :aria-pressed="currentTool === 'pen'"
            @click="setTool('pen')"
          >
            Кисть
          </button>
          <button
            class="btn-outline"
            type="button"
            :aria-pressed="currentTool === 'eraser'"
            @click="setTool('eraser')"
          >
            Ластик
          </button>
          <button
            class="btn-outline"
            type="button"
            :disabled="isCanvasEmpty"
            @click="clearCanvasSurface"
          >
            Очистить
          </button>
        </div>
        <canvas
          ref="drawingCanvasRef"
          width="720"
          height="450"
          aria-label="Холст для рисования мышью или касанием"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
          @touchstart.prevent="handleTouchStart"
          @touchmove.prevent="handleTouchMove"
          @touchend.prevent="handleTouchEnd"
          @touchcancel="handleMouseLeave"
        >
          Рисунок можно выполнить на бумаге.
        </canvas>
        <button class="btn-outline" type="button" :disabled="isCanvasEmpty" @click="download">
          <Icon name="download" :size="17" /> Скачать рисунок
        </button>
      </div>
      <details class="save-details">
        <summary>Сохранить рисунок или заметку</summary>
        <SaveWorkForm
          ref="workForm"
          :practice-id="practice.id"
          :initial-title="practice.title"
          :prompt="practice.prompt"
          :allow-photo="mode === 'paper'"
          :read-drawing="readDrawing"
          :drawing-revision="mode === 'canvas' ? drawingRevision : undefined"
          @saved="saved"
        />
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
.canvas-tools,
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
.canvas-area {
  display: grid;
  gap: var(--space-3);
}
.canvas-area canvas {
  display: block;
  width: 100%;
  height: auto;
  background: #fff;
  border-radius: var(--radius-sm);
  touch-action: none;
  cursor: crosshair;
}
.canvas-area > button {
  justify-self: start;
}
.canvas-tools input {
  width: 2.75rem;
  height: 2.75rem;
  padding: var(--space-1);
}
.canvas-tools [aria-pressed='true'] {
  background: var(--accent-soft);
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
