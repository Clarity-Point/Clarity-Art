<template>
  <div class="page page-narrow diary-view">
    <h1 class="page-title display">Мой дневник</h1>
    <p class="page-subtitle">
      Место для ваших мыслей и чувств. Пишите свободно — здесь вас никто не торопит и не оценивает.
    </p>

    <!-- New entry composer -->
    <section class="card composer-card">
      <div class="composer-head">
        <span class="composer-icon"><Icon name="edit" :size="18" /></span>
        <div>
          <label for="new-entry" class="composer-label">Новая запись</label>
          <p class="composer-hint muted">Что у вас на уме прямо сейчас?</p>
        </div>
      </div>
      <textarea
        id="new-entry"
        ref="composerTextarea"
        v-model="newEntryText"
        placeholder="Опишите, что происходит внутри вас прямо сейчас..."
      ></textarea>
      <div class="composer-actions">
        <button class="btn-primary" @click="submitNewEntry" :disabled="!newEntryText.trim()">
          <Icon name="edit" :size="17" />
          Добавить запись
        </button>
      </div>
    </section>

    <!-- Analysis -->
    <section class="card analysis-card">
      <div class="section-head">
        <h2 class="section-title">Анализ записей</h2>
      </div>

      <div class="analysis-controls">
        <div class="segmented" role="group" aria-label="Период анализа">
          <button
            v-for="opt in periodOptions"
            :key="opt.value"
            type="button"
            class="chip segmented-option"
            :class="{ 'segmented-option-active': analysisPeriod === opt.value }"
            :aria-pressed="analysisPeriod === opt.value"
            @click="analysisPeriod = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <button
          class="btn-accent"
          @click="performDiaryAnalysis"
          :disabled="isAnalyzingDiary || diaryEntries.length === 0"
        >
          <Icon name="sparkles" :size="16" />
          {{ isAnalyzingDiary ? 'Анализируем…' : 'Сделать анализ' }}
        </button>
      </div>

      <div v-if="isAnalyzingDiary" class="analysis-status muted">
        <span
          class="skeleton"
          style="height: 14px; width: 60%; display: block; margin-bottom: 8px"
        ></span>
        <span class="skeleton" style="height: 14px; width: 40%; display: block"></span>
      </div>

      <div v-else-if="diaryAnalysisResult" class="analysis-result">
        <VueMarkdown :source="diaryAnalysisResult" class="markdown-content" />
      </div>

      <div v-else-if="diaryAnalysisError" class="analysis-error">
        <Icon name="alert-triangle" :size="16" />
        <span>{{ diaryAnalysisError }}</span>
      </div>

      <p v-else-if="diaryEntries.length === 0" class="analysis-hint muted">
        Добавьте хотя бы одну запись, чтобы получить бережный анализ вашего состояния.
      </p>
    </section>

    <!-- Calendar of activity -->
    <section class="card calendar-card">
      <div class="section-head">
        <h2 class="section-title">Календарь активности</h2>
        <div class="calendar-nav">
          <button class="icon-btn" aria-label="Предыдущий месяц" @click="prevMonth">
            <Icon name="chevron-left" :size="18" />
          </button>
          <span class="calendar-month-label">{{ monthLabel }}</span>
          <button class="icon-btn" aria-label="Следующий месяц" @click="nextMonth">
            <Icon name="chevron-right" :size="18" />
          </button>
        </div>
      </div>

      <div class="calendar-grid calendar-weekdays">
        <span v-for="wd in weekDayLabels" :key="wd" class="calendar-weekday muted">{{ wd }}</span>
      </div>
      <div class="calendar-grid">
        <span
          v-for="(cell, idx) in calendarDays"
          :key="idx"
          class="calendar-cell"
          :class="{
            'calendar-cell-outside': !cell.inMonth,
            'calendar-cell-today': cell.isToday,
            'calendar-cell-entry': cell.hasEntry,
          }"
        >
          <span class="calendar-cell-num">{{ cell.day }}</span>
          <span v-if="cell.hasEntry" class="calendar-dot" aria-hidden="true"></span>
        </span>
      </div>

      <p class="calendar-frequency muted">{{ getEntryFrequencyMetrics() }}</p>
    </section>

    <!-- Entries -->
    <section class="entries-section">
      <div class="section-head">
        <h2 class="section-title">Все записи</h2>
      </div>

      <div v-if="diaryEntries.length === 0" class="empty-state">
        <span class="empty-icon"><Icon name="edit" :size="32" /></span>
        <p>У вас пока нет записей. Начните с одной мысли — этого достаточно.</p>
        <button class="btn-primary" @click="focusComposer">
          <Icon name="edit" :size="17" />
          Написать первую запись
        </button>
      </div>

      <div v-else class="stack">
        <article v-for="entry in sortedDiaryEntries" :key="entry.id" class="card entry-card">
          <div v-if="editingEntryId === entry.id" class="entry-edit-mode">
            <textarea v-model="currentEditText" class="edit-textarea"></textarea>
            <div class="edit-actions">
              <button class="btn-outline btn-sm" @click="cancelEdit">Отмена</button>
              <button class="btn-primary btn-sm" @click="saveEdit">Сохранить</button>
            </div>
          </div>
          <div v-else>
            <div class="entry-head">
              <span class="entry-date muted">{{ formatEntryDate(entry.date) }}</span>
              <span v-if="entry.analysis?.mood" class="chip badge-primary entry-mood">
                <Icon name="smile" :size="13" />
                {{ entry.analysis.mood }}
              </span>
            </div>
            <p class="entry-text">{{ entry.text }}</p>
            <div class="entry-actions">
              <button class="icon-btn" aria-label="Редактировать запись" @click="startEdit(entry)">
                <Icon name="edit" :size="17" />
              </button>
              <button
                class="icon-btn"
                aria-label="Удалить запись"
                @click="requestDeleteEntry(entry.id)"
              >
                <Icon name="trash" :size="17" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import VueMarkdown from 'vue-markdown-render';
import Icon from '@/components/Icon.vue';
import { useDiaryEntries } from '@/composables/useDiaryEntries';
import { useDiaryAnalysis } from '@/composables/useDiaryAnalysis';
import { useDiaryCalendar } from '@/composables/useDiaryCalendar';

const {
  diaryEntries,
  newEntryText,
  composerTextarea,
  focusComposer,
  editingEntryId,
  currentEditText,
  startEdit,
  saveEdit,
  cancelEdit,
  requestDeleteEntry,
  submitNewEntry,
  sortedDiaryEntries,
  formatEntryDate,
} = useDiaryEntries();

const {
  analysisPeriod,
  isAnalyzingDiary,
  diaryAnalysisResult,
  diaryAnalysisError,
  periodOptions,
  performDiaryAnalysis,
} = useDiaryAnalysis();

const { weekDayLabels, monthLabel, prevMonth, nextMonth, calendarDays, getEntryFrequencyMetrics } =
  useDiaryCalendar();
</script>

<style scoped>
.diary-view > .composer-card,
.diary-view > .analysis-card,
.diary-view > .calendar-card {
  margin-bottom: var(--space-5);
}

.entries-section {
  margin-top: var(--space-6);
}

/* --- Composer --- */
.composer-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.composer-card textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.6;
}
.composer-actions {
  display: flex;
  justify-content: flex-end;
}

.composer-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.composer-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}
.composer-label {
  display: block;
  font-size: var(--text-lg);
  font-weight: 650;
  margin-bottom: 2px;
}
.composer-hint {
  margin: 0;
  font-size: var(--text-sm);
}

/* --- Analysis --- */
.analysis-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.segmented {
  display: inline-flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.segmented-option {
  cursor: pointer;
  border: 1px solid var(--border-color);
  font-weight: 600;
  padding: 6px 14px;
}
.segmented-option-active {
  background: var(--primary-soft);
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.analysis-status {
  padding: var(--space-2) 0;
}

.analysis-result {
  margin-top: var(--space-2);
  padding: var(--space-4);
  background-color: var(--bg-soft);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  line-height: 1.6;
}

.analysis-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-color);
  border-radius: var(--radius-sm);
}

.analysis-hint {
  margin: 0;
  font-style: italic;
}

/* --- Calendar --- */
.calendar-nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.calendar-month-label {
  font-weight: 650;
  min-width: 11ch;
  text-align: center;
  text-transform: capitalize;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-1);
}
.calendar-weekdays {
  margin-bottom: var(--space-2);
}
.calendar-weekday {
  text-align: center;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.calendar-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-color);
  background: var(--bg-soft);
}
.calendar-cell-outside {
  color: var(--faint-text);
  background: transparent;
}
.calendar-cell-today {
  box-shadow: inset 0 0 0 2px var(--primary-color);
  font-weight: 700;
}
.calendar-cell-entry {
  background: var(--primary-soft);
  color: var(--primary-color);
  font-weight: 650;
}

.calendar-dot {
  position: absolute;
  bottom: 5px;
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
}

.calendar-frequency {
  margin: var(--space-4) 0 0;
  font-size: var(--text-sm);
  text-align: center;
}

.entries-section .empty-state .btn-primary {
  margin-top: var(--space-3);
}

/* --- Entries --- */
.entry-card {
  transition:
    box-shadow var(--transition),
    border-color var(--transition);
}
.entry-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.entry-date {
  font-size: var(--text-xs);
}
.entry-mood {
  text-transform: capitalize;
}

.entry-text {
  font-size: var(--text-base);
  color: var(--text-color);
  line-height: 1.7;
  white-space: pre-wrap;
  margin-bottom: var(--space-3);
}

.entry-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}

.entry-edit-mode .edit-textarea {
  min-height: 100px;
  line-height: 1.6;
  resize: vertical;
  margin-bottom: var(--space-3);
}

.edit-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

/* --- Markdown content inside analysis result --- */
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
  font-weight: 600;
}
.markdown-content :deep(p) {
  margin-bottom: 0.8em;
}
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 2em;
  margin-bottom: 0.8em;
}
.markdown-content :deep(li) {
  margin-bottom: 0.3em;
}
.markdown-content :deep(blockquote) {
  margin-left: 1em;
  padding-left: 1em;
  border-left: 3px solid var(--muted-text);
  color: var(--text-color);
  font-style: italic;
}
.markdown-content :deep(code) {
  background-color: var(--bg-soft);
  color: var(--text-color);
  padding: 0.2em 0.4em;
  border-radius: var(--radius-sm);
  font-size: 0.9em;
}
.markdown-content :deep(pre) {
  background-color: var(--bg-soft);
  color: var(--text-color);
  padding: 1em;
  border-radius: var(--radius-sm);
  overflow-x: auto;
}
.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}
.markdown-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}
.markdown-content :deep(a:hover) {
  text-decoration: underline;
}
.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
}
.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5em 0.75em;
  text-align: left;
}
.markdown-content :deep(th) {
  background-color: var(--bg-soft);
  color: var(--muted-text);
}

@media (max-width: 560px) {
  .analysis-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .analysis-controls .btn-accent {
    width: 100%;
  }
  .calendar-cell {
    font-size: var(--text-xs);
  }
}
</style>
