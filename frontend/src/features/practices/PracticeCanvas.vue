<script setup lang="ts">
import { ref, useId } from 'vue';
import Icon from '@/components/Icon.vue';
import { useCanvasDrawing } from '@/composables/useCanvasDrawing';
import { asDrawing, type DrawingFile } from './api';

const props = defineProps<{
  practiceId: string;
  disabled?: boolean;
  allowDrawing?: () => boolean;
}>();
const emit = defineEmits<{ changed: [hasDrawing: boolean]; downloaded: [] }>();
const inkId = useId();
const downloadError = ref(false);
const {
  drawingCanvasRef,
  currentColor,
  currentTool,
  isCanvasEmpty,
  isDrawing,
  setTool,
  checkIfCanvasIsEmpty,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleMouseLeave,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleTouchCancel,
  clearCanvasSurface,
} = useCanvasDrawing({
  tapToFullscreen: false,
  onChange: () => {
    downloadError.value = false;
    emit('changed', !isCanvasEmpty.value);
  },
});

function readDrawing() {
  if (isDrawing.value) return undefined;
  const canvas = drawingCanvasRef.value;
  if (!canvas || isCanvasEmpty.value) return null;
  const drawing = asDrawing(canvas.toDataURL('image/png'));
  if (!drawing) throw new Error('Canvas encoding failed');
  return drawing;
}
function download() {
  downloadError.value = false;
  try {
    handleMouseLeave();
    const drawing = readDrawing();
    if (!drawing) return;
    const link = document.createElement('a');
    link.href = `data:${drawing.mimeType};base64,${drawing.base64}`;
    link.download = `${props.practiceId}.png`;
    link.click();
    emit('downloaded');
  } catch {
    downloadError.value = true;
  }
}
function startMouse(event: MouseEvent) {
  if (!props.disabled && (props.allowDrawing?.() ?? true)) handleMouseDown(event);
}
function startTouch(event: TouchEvent) {
  if (!props.disabled && (props.allowDrawing?.() ?? true)) handleTouchStart(event);
}
async function restore(drawing: DrawingFile | null, signal?: AbortSignal) {
  const canvas = drawingCanvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  if (!drawing) {
    if (!signal?.aborted) clearCanvasSurface(false);
    return;
  }
  const image = new Image();
  image.src = `data:${drawing.mimeType};base64,${drawing.base64}`;
  await image.decode();
  if (signal?.aborted) return;
  clearCanvasSurface(false);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  checkIfCanvasIsEmpty();
}
defineExpose({ restore, readDrawing, download, commitStroke: handleMouseLeave });
</script>

<template>
  <div class="canvas-area">
    <fieldset :disabled="disabled" class="canvas-tools">
      <label :for="inkId">Цвет</label>
      <input :id="inkId" v-model="currentColor" type="color" />
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
        :disabled="disabled || isCanvasEmpty"
        @click="clearCanvasSurface()"
      >
        Очистить
      </button>
    </fieldset>
    <canvas
      ref="drawingCanvasRef"
      width="720"
      height="450"
      aria-label="Холст для рисования мышью или касанием"
      @mousedown="startMouse"
      @mousemove="!disabled && handleMouseMove($event)"
      @mouseup="!disabled && handleMouseUp($event)"
      @mouseleave="handleMouseLeave"
      @touchstart.prevent="startTouch"
      @touchmove.prevent="!disabled && handleTouchMove($event)"
      @touchend.prevent="!disabled && handleTouchEnd($event)"
      @touchcancel="handleTouchCancel"
    >
      Рисунок можно выполнить на бумаге.
    </canvas>
    <button class="btn-outline" type="button" :disabled="isCanvasEmpty" @click="download">
      <Icon name="download" :size="17" /> Скачать рисунок
    </button>
    <p v-if="downloadError" role="alert">
      Не удалось подготовить рисунок. Попробуйте скачать его ещё раз.
    </p>
  </div>
</template>

<style scoped>
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
.canvas-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
</style>
