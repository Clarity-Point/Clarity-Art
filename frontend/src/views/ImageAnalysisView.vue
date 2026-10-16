<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Анализ рисунка</h1>
      <p class="page-subtitle">
        Загрузите фотографию рисунка или нарисуйте что-нибудь прямо здесь — и получите бережную,
        безоценочную интерпретацию: какие чувства, темы и образы в нём видны.
      </p>
    </header>

    <!-- Method switcher -->
    <div class="method-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="activeMethod === 'upload'"
        :class="['method-tab', { active: activeMethod === 'upload' }]"
        @click="activeMethod = 'upload'"
      >
        <span class="method-tab-icon"><Icon name="upload" :size="18" /></span>
        Загрузить изображение
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeMethod === 'draw'"
        :class="['method-tab', { active: activeMethod === 'draw' }]"
        @click="activeMethod = 'draw'"
      >
        <span class="method-tab-icon"><Icon name="palette" :size="18" /></span>
        Нарисовать
      </button>
    </div>

    <!-- Section for Uploading Image -->
    <section v-show="activeMethod === 'upload'" class="card method-card">
      <div class="row-between method-card-head">
        <h2 class="section-title">Загрузить изображение</h2>
      </div>

      <label class="dropzone" for="image-upload-input" :class="{ 'has-file': !!selectedImageFile }">
        <input
          id="image-upload-input"
          type="file"
          class="dropzone-input"
          @change="handleImageUpload"
          accept="image/png, image/jpeg, image/webp, image/gif"
          ref="fileInputRef"
        />
        <template v-if="!selectedImageFile">
          <span class="dropzone-icon"><Icon name="upload" :size="30" /></span>
          <p class="dropzone-title">Перетащите рисунок сюда или выберите файл</p>
          <p class="dropzone-hint muted">PNG, JPEG, WEBP или GIF</p>
        </template>
        <template v-else>
          <span class="dropzone-icon success"><Icon name="check-circle" :size="28" /></span>
          <p class="dropzone-title">{{ selectedImageFile.name }}</p>
          <p class="dropzone-hint muted">Файл выбран — нажмите ещё раз, чтобы заменить</p>
        </template>
      </label>

      <button
        type="button"
        @click="triggerFileUploadAnalyze"
        :disabled="!selectedImageFile || isLoading"
        class="btn-primary btn-lg analyze-button"
      >
        <span
          v-if="isLoading && analysisType === 'upload'"
          class="btn-spinner"
          aria-hidden="true"
        ></span>
        <Icon v-else name="sparkles" :size="18" />
        {{
          isLoading && analysisType === 'upload'
            ? 'Анализируем загруженное…'
            : 'Анализировать загруженное'
        }}
      </button>
    </section>

    <!-- Section for Drawing -->
    <section
      v-show="activeMethod === 'draw'"
      :class="['card', 'method-card', { 'fullscreen-mode': isCanvasFullscreen }]"
    >
      <div class="row-between method-card-head" v-if="!isCanvasFullscreen">
        <h2 class="section-title">Нарисовать для анализа</h2>
      </div>

      <div :class="['drawing-section', { 'fullscreen-mode': isCanvasFullscreen }]">
        <div class="canvas-tools" v-if="!isCanvasFullscreen">
          <div class="swatch-group" role="group" aria-label="Цвет кисти">
            <button
              type="button"
              v-for="swatch in colorSwatches"
              :key="swatch.color"
              @click="setTool('pen', swatch.color)"
              :class="[
                'swatch',
                { active: currentTool === 'pen' && currentColor === swatch.color },
              ]"
              :style="{ '--swatch-color': swatch.color }"
              :aria-label="swatch.label"
              :aria-pressed="currentTool === 'pen' && currentColor === swatch.color"
              :title="swatch.label"
            ></button>
          </div>

          <button
            type="button"
            @click="setTool('eraser')"
            :class="['btn-outline', 'btn-sm', 'tool-btn', { active: currentTool === 'eraser' }]"
          >
            <Icon name="eraser" :size="16" /> Ластик
          </button>

          <label class="tool-select-label">
            Толщина
            <select v-model="lineWidth" class="tool-select">
              <option value="2">Тонкая</option>
              <option value="5">Средняя</option>
              <option value="10">Толстая</option>
              <option value="20">Очень толстая</option>
            </select>
          </label>

          <button type="button" @click="clearCanvas" class="btn-outline btn-sm tool-btn clear-btn">
            <Icon name="trash" :size="16" /> Очистить
          </button>
        </div>

        <div class="canvas-frame">
          <canvas
            ref="drawingCanvasRef"
            @mousedown="handleMouseDown"
            @mousemove="handleMouseMove"
            @mouseup="handleMouseUp"
            @mouseleave="handleMouseLeave"
            @touchstart.prevent="handleTouchStart"
            @touchmove.prevent="handleTouchMove"
            @touchend.prevent="handleTouchEnd"
            width="600"
            height="400"
            :class="['drawing-canvas', { fullscreen: isCanvasFullscreen }]"
          ></canvas>
        </div>

        <button
          v-if="!isCanvasFullscreen"
          type="button"
          @click="triggerCanvasAnalysis"
          :disabled="isLoading || isCanvasEmpty"
          class="btn-primary btn-lg analyze-button"
        >
          <span
            v-if="isLoading && analysisType === 'canvas'"
            class="btn-spinner"
            aria-hidden="true"
          ></span>
          <Icon v-else name="sparkles" :size="18" />
          {{
            isLoading && analysisType === 'canvas'
              ? 'Анализируем нарисованное…'
              : 'Анализировать нарисованное'
          }}
        </button>
        <button
          v-if="isCanvasFullscreen"
          type="button"
          @click="toggleCanvasFullscreen"
          class="btn-outline exit-fullscreen-btn"
        >
          <Icon name="chevron-left" :size="16" /> Вернуться к обычному виду
        </button>
      </div>
    </section>

    <div v-if="currentAnalysisPreview" class="card preview-card">
      <div class="section-head">
        <h2 class="section-title">Ваш рисунок</h2>
      </div>
      <img
        :src="currentAnalysisPreview"
        alt="Рисунок, отправленный на анализ"
        class="preview-img"
      />
    </div>

    <div v-if="analysisResult" class="card result-card">
      <div class="row-between result-head">
        <div class="row">
          <span class="medallion"><Icon name="lightbulb" :size="20" /></span>
          <div>
            <h2 class="section-title">Мягкая интерпретация</h2>
            <p class="result-sub muted">
              Не диагноз — просто взгляд со стороны, чтобы было о чём подумать
            </p>
          </div>
        </div>
        <span v-if="currentAnalysisTimestamp" class="chip badge-primary">
          <Icon name="clock" :size="12" /> {{ formatHistoryDate(currentAnalysisTimestamp) }}
        </span>
      </div>
      <VueMarkdown :source="analysisResult" class="markdown-content" />
      <button
        v-if="!showExtendedAnalysis && !extendedAnalysisDisplay"
        type="button"
        @click="openExtendedAnalysis"
        class="btn-accent extended-analysis-button"
      >
        <Icon name="search" :size="16" /> Расширенный анализ
      </button>
    </div>

    <!-- Extended Analysis Questions Section -->
    <div v-if="showExtendedAnalysis && analysisResult" class="card extended-analysis-section">
      <div class="row result-head">
        <span class="medallion medallion-accent"><Icon name="message-circle" :size="20" /></span>
        <h2 class="section-title">Расширенный анализ: вопросы для саморефлексии</h2>
      </div>
      <p class="extended-analysis-intro">
        Понимаю, нужен самый сок! Вот те вопросы, которые действительно стоит задавать практически
        по каждому рисунку, так как они открывают ключевые аспекты для анализа и диалога:
      </p>
      <ul class="question-list">
        <li
          v-for="(question, index) in extendedAnalysisQuestions"
          :key="index"
          class="question-item"
        >
          <p class="question-text">
            <strong>{{ question.text }}</strong>
          </p>
          <p class="question-rationale"><em>Почему обязательно:</em> {{ question.rationale }}</p>
          <textarea
            v-model="extendedAnalysisAnswers[index]"
            rows="3"
            placeholder="Ваш ответ..."
            class="answer-textarea"
          ></textarea>
        </li>
      </ul>
      <div class="extended-analysis-conclusion">
        <button
          type="button"
          @click="submitExtendedAnalysis"
          :disabled="isLoading || !areAllExtendedQuestionsAnswered"
          class="btn-primary btn-lg submit-extended-analysis-button"
        >
          <span
            v-if="isLoading && analysisType === 'extended'"
            class="btn-spinner"
            aria-hidden="true"
          ></span>
          {{
            isLoading && analysisType === 'extended'
              ? 'Отправляем…'
              : 'Отправить расширенный анализ'
          }}
        </button>
      </div>
    </div>

    <!-- Display for the AI's response to the extended analysis -->
    <div v-if="extendedAnalysisDisplay" class="card extended-analysis-display-section">
      <div class="row result-head">
        <span class="medallion"><Icon name="sparkles" :size="20" /></span>
        <h2 class="section-title">Ответ на расширенный анализ</h2>
      </div>
      <VueMarkdown :source="extendedAnalysisDisplay" class="markdown-content" />
    </div>

    <div v-if="errorMessage" class="error-message">
      <Icon name="alert-triangle" :size="18" />
      <p>{{ errorMessage }}</p>
    </div>

    <!-- History -->
    <div v-if="historyEntries.length" class="history-section">
      <div class="section-head">
        <h2 class="section-title">История анализов</h2>
        <span class="muted history-count">{{ historyEntries.length }}</span>
      </div>
      <div class="grid grid-auto history-grid">
        <article v-for="entry in historyEntries" :key="entry.timestamp" class="card history-card">
          <div class="history-thumb-wrap">
            <span class="thumb-placeholder"><Icon name="palette" :size="26" /></span>
            <img
              v-if="entry.imagePreviewUrl"
              :src="entry.imagePreviewUrl"
              :alt="entry.originalImageName || 'Рисунок'"
              class="history-thumb"
              loading="lazy"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
          <div class="history-body">
            <div class="row-between history-meta">
              <span class="chip badge-primary">
                <Icon name="clock" :size="12" /> {{ formatHistoryDate(entry.timestamp) }}
              </span>
              <span v-if="entry.extendedAnalysisText" class="chip badge-success">
                <Icon name="check" :size="12" /> Расширен
              </span>
            </div>
            <p class="history-text">{{ truncate(entry.analysisText, 160) }}</p>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import VueMarkdown from 'vue-markdown-render';
import Icon from '@/components/Icon.vue';
import { useCanvasDrawing } from '@/composables/useCanvasDrawing';
import { useImageAnalysis } from '@/composables/useImageAnalysis';

// --- View-only state: which method tab is active ---
const activeMethod = ref<'upload' | 'draw'>('upload');

// --- View-only: pen colour swatches shown as round buttons ---
const colorSwatches = [
  { color: 'black', label: 'Чёрный' },
  { color: 'red', label: 'Красный' },
  { color: 'blue', label: 'Синий' },
  { color: 'green', label: 'Зелёный' },
];

// --- Drawing surface (pen/eraser, fullscreen, emptiness) ---
const {
  drawingCanvasRef,
  currentColor,
  currentTool,
  lineWidth,
  isCanvasEmpty,
  isCanvasFullscreen,
  toggleCanvasFullscreen,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleMouseLeave,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  setTool,
  clearCanvasSurface,
} = useCanvasDrawing();

// --- Upload + AI analysis (primary + extended) + history ---
const {
  analysisResult,
  isLoading,
  errorMessage,
  currentAnalysisPreview,
  analysisType,
  currentAnalysisTimestamp,
  extendedAnalysisDisplay,
  showExtendedAnalysis,
  extendedAnalysisAnswers,
  extendedAnalysisQuestions,
  openExtendedAnalysis,
  selectedImageFile,
  fileInputRef,
  handleImageUpload,
  triggerFileUploadAnalyze,
  performAnalysis,
  submitExtendedAnalysis,
  areAllExtendedQuestionsAnswered,
  historyEntries,
  formatHistoryDate,
  truncate,
} = useImageAnalysis();

// --- Wiring across the two composables ---
const clearCanvas = () => {
  if (clearCanvasSurface()) {
    if (analysisType.value === 'canvas') currentAnalysisPreview.value = null;
    analysisResult.value = null;
    errorMessage.value = null;
    extendedAnalysisDisplay.value = null;
    showExtendedAnalysis.value = false;
    extendedAnalysisAnswers.value = {};
  }
};

const triggerCanvasAnalysis = () => {
  if (!drawingCanvasRef.value || isCanvasEmpty.value) {
    errorMessage.value = 'Холст пуст. Пожалуйста, нарисуйте что-нибудь для анализа.';
    return;
  }
  analysisType.value = 'canvas';
  performAnalysis(drawingCanvasRef.value.toDataURL('image/png'));
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

/* Method tab switcher */
.method-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}
.method-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--muted-text);
  font-weight: 600;
  font-size: var(--text-base);
  cursor: pointer;
  transition: all var(--transition);
}
.method-tab:hover {
  border-color: var(--border-strong);
  color: var(--text-color);
}
.method-tab.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--on-primary);
}
.method-tab-icon {
  display: inline-flex;
}

.method-card {
  margin-bottom: var(--space-6);
}
.method-card-head {
  margin-bottom: var(--space-5);
}
.method-card.fullscreen-mode {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}

/* Upload dropzone */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-7) var(--space-5);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-soft);
  cursor: pointer;
  transition:
    border-color var(--transition),
    background-color var(--transition);
  margin-bottom: var(--space-5);
}
.dropzone:hover {
  border-color: var(--primary-color);
  background: var(--primary-soft);
}
.dropzone.has-file {
  border-style: solid;
  border-color: var(--success-text);
  background: var(--success-bg);
}
.dropzone-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.dropzone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  margin-bottom: var(--space-2);
}
.dropzone-icon.success {
  background: var(--success-bg);
  color: var(--success-text);
}
.dropzone-title {
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}
.dropzone-hint {
  font-size: var(--text-sm);
  margin: 0;
}

.analyze-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: currentColor;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Drawing tools */
.drawing-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}
.canvas-tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-1);
  justify-content: center;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-soft);
  border-radius: var(--radius);
  width: 100%;
  box-sizing: border-box;
}

.swatch-group {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 2px solid var(--border-color);
  background-color: var(--swatch-color);
  cursor: pointer;
  padding: 0;
  transition:
    transform var(--transition),
    box-shadow var(--transition);
}
.swatch:hover {
  transform: scale(1.1);
}
.swatch.active {
  border-color: var(--text-color);
  box-shadow: 0 0 0 3px var(--ring);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.tool-btn.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--on-primary);
}

.tool-select-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-color);
  font-size: var(--text-sm);
}
.tool-select {
  padding: 6px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  background-color: var(--card-bg);
}

.canvas-frame {
  padding: var(--space-3);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.fullscreen-mode .canvas-frame {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}

.drawing-canvas {
  display: block;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: crosshair;
  background-color: #ffffff;
  touch-action: none;
  max-width: 100%;
}
/*
 * Fullscreen must sit above the entire app shell. GlobalHeader is z-index 1000
 * and SidebarMenu 1002, so anything below that leaves the fixed header and
 * sidebar painted over the canvas — the drawing surface appeared clipped and the
 * exit button unreachable.
 */
.drawing-canvas.fullscreen {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  border-radius: 0;
  border: none;
  position: fixed;
  inset: 0;
  z-index: var(--z-fullscreen-canvas);
}

.fullscreen-mode {
  position: fixed;
  inset: 0;
  z-index: var(--z-fullscreen);
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.exit-fullscreen-btn {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-fullscreen-canvas);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
}

/* Preview / result cards */
.preview-card,
.result-card {
  margin-bottom: var(--space-6);
  text-align: left;
}
.preview-img {
  display: block;
  max-width: 100%;
  max-height: 480px;
  margin: 0 auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background-color: var(--card-bg);
}

.result-head {
  margin-bottom: var(--space-4);
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.result-sub {
  font-size: var(--text-sm);
  margin: 2px 0 0;
}

.markdown-content {
  line-height: 1.7;
  color: var(--text-color);
}
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--text-color);
  margin-top: 1.2em;
  margin-bottom: 0.6em;
}
.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--border-strong);
  color: var(--text-color);
}
.markdown-content :deep(code) {
  background-color: var(--bg-soft);
  color: var(--text-color);
}
.markdown-content :deep(pre) {
  background-color: var(--bg-soft);
}
.markdown-content :deep(a) {
  color: var(--primary-color);
}
.markdown-content :deep(table) {
  border-collapse: collapse;
  margin-bottom: 1em;
}
.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5em 0.75em;
}
.markdown-content :deep(th) {
  background-color: var(--bg-soft);
}

.error-message {
  margin-top: var(--space-5);
  margin-bottom: var(--space-6);
  padding: var(--space-4) var(--space-5);
  background-color: var(--danger-bg);
  color: var(--danger-text);
  border-radius: var(--radius-sm);
  line-height: 1.6;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.error-message p {
  margin: 0;
}

/* Extended Analysis Section Styles */
.extended-analysis-section {
  margin-bottom: var(--space-6);
  text-align: left;
}

.extended-analysis-intro {
  font-style: italic;
  margin-bottom: var(--space-5);
  line-height: 1.6;
  color: var(--muted-text);
}

.question-list {
  list-style-type: none;
  padding-left: 0;
  margin-bottom: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.question-item {
  padding: var(--space-4);
  background-color: var(--bg-soft);
  border-radius: var(--radius-sm);
  border-left: 4px solid var(--primary-color);
}

.question-text strong {
  color: var(--text-color);
  font-size: 1.05em;
}

.question-rationale {
  font-size: var(--text-sm);
  color: var(--muted-text);
  margin-top: var(--space-2);
  line-height: 1.5;
}

.extended-analysis-conclusion {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
}

.extended-analysis-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-5) auto 0;
}

.answer-textarea {
  width: 100%;
  padding: var(--space-3);
  margin-top: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
  font-family: inherit;
  font-size: var(--text-sm);
  line-height: 1.5;
  background-color: var(--card-bg);
  color: var(--text-color);
}
.answer-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--ring);
}

.submit-extended-analysis-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  max-width: 420px;
  width: 100%;
}

.extended-analysis-display-section {
  margin-bottom: var(--space-6);
  text-align: left;
}

/* History */
.history-section {
  margin-top: var(--space-7);
}
.history-count {
  font-size: var(--text-sm);
  background: var(--bg-soft);
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
}
.history-grid {
  margin-top: var(--space-2);
}
.history-card {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition:
    transform var(--transition),
    box-shadow var(--transition);
}
.history-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}
.history-thumb-wrap {
  position: relative;
  height: 160px;
  background: linear-gradient(135deg, var(--primary-soft), var(--accent-soft));
  overflow: hidden;
}
/* Placeholder sits behind the image; if the image is missing or fails to load
   (@error hides it), the palette medallion shows through. */
.thumb-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  opacity: 0.75;
}
.history-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.history-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.history-meta {
  font-size: var(--text-xs);
}
.history-text {
  font-size: var(--text-sm);
  color: var(--muted-text);
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 640px) {
  .method-tabs {
    flex-direction: column;
  }
  .method-tab {
    justify-content: center;
  }
  .canvas-tools {
    flex-direction: column;
    align-items: stretch;
  }
  .swatch-group {
    justify-content: center;
  }
}
</style>
