<template>
  <div class="page page-narrow homework-detail-view">
    <button type="button" @click="goBack" class="btn-ghost back-link">
      <Icon name="arrow-left" :size="16" /> Назад
    </button>

    <header class="hw-header">
      <span class="medallion medallion-accent"><Icon name="file-text" :size="22" /></span>
      <div>
        <h1 class="page-title display">{{ homeworkTitle }}</h1>
        <p v-if="homeworkId" class="hw-description muted">{{ homeworkDescription }}</p>
        <p v-else class="muted">Загрузка информации о домашнем задании…</p>
        <p v-if="courseContextId" class="course-context">
          <Icon name="book-open" :size="15" />
          Относится к курсу
          <RouterLink :to="{ name: 'CourseDetail', params: { courseId: courseContextId } }">{{
            courseTitle
          }}</RouterLink>
        </p>
      </div>
    </header>

    <section class="card submission-area">
      <div class="section-head"><h2 class="section-title">Сдать задание</h2></div>
      <p class="submission-hint muted">
        Опишите своими словами, что вы сделали, или оставьте ссылку на работу — здесь нет правильных
        и неправильных ответов, только ваш опыт.
      </p>
      <label for="homework-answer">Ваш ответ</label>
      <textarea
        id="homework-answer"
        v-model="submissionContent"
        placeholder="Введите ваш ответ или ссылку на работу..."
        rows="6"
        maxlength="20000"
        :disabled="!draftReady || isSubmitting || !metadataReady"
      ></textarea>
      <DraftStatus
        :state="draftState"
        :error="draftError"
        @retry="flushDraft"
        @reload="reloadSaved"
      />
      <div class="submission-actions">
        <button
          type="button"
          class="btn-primary"
          @click="submitHomework"
          :disabled="!submissionContent.trim() || isSubmitting || !draftReady || !metadataReady"
        >
          <Icon name="send" :size="16" /> {{ isSubmitting ? 'Отправляем…' : 'Сдать' }}
        </button>
      </div>
      <p
        v-if="submissionMessage"
        class="submission-feedback"
        role="status"
        :class="{
          'is-success': submissionMessage.includes('успешно'),
          'is-error': submissionMessage.includes('Не удалось'),
        }"
      >
        <Icon
          :name="submissionMessage.includes('Не удалось') ? 'alert-triangle' : 'check-circle'"
          :size="16"
        />
        {{ submissionMessage }}
      </p>
    </section>

    <section v-if="currentSubmission" class="card current-submission-status">
      <div class="section-head">
        <h2 class="section-title">Ваша текущая сдача</h2>
        <span :class="['chip', currentSubmission.grade ? 'badge-success' : 'badge-info']">
          {{ currentSubmission.grade ? `Оценка: ${currentSubmission.grade}` : 'Ожидает проверки' }}
        </span>
      </div>

      <dl class="submission-details">
        <div class="detail-row">
          <dt><Icon name="calendar" :size="15" /> Дата сдачи</dt>
          <dd>{{ formattedSubmissionDate }}</dd>
        </div>
        <div class="detail-row">
          <dt><Icon name="edit" :size="15" /> Содержимое</dt>
          <dd>{{ currentSubmission.submittedContent }}</dd>
        </div>
      </dl>

      <div v-if="currentSubmission.analysisText" class="ai-analysis">
        <div class="ai-analysis-head">
          <Icon name="sparkles" :size="18" />
          <h3>Анализ и обратная связь</h3>
        </div>
        <p class="ai-analysis-text">{{ currentSubmission.analysisText }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import axios from 'axios';
import { useUserProfileStore, type HomeworkEntry } from '@/stores/userProfileStore';
import { useServerDraft } from '@/composables/useServerDraft';
import DraftStatus from '@/components/DraftStatus.vue';
import Icon from '@/components/Icon.vue';
const route = useRoute(),
  router = useRouter(),
  userProfileStore = useUserProfileStore();
const homeworkId = computed(() => String(route.params.homeworkId || ''));
const homeworkTitle = ref('Детали задания'),
  homeworkDescription = ref(''),
  courseContextId = ref(''),
  courseTitle = ref(''),
  metadataReady = ref(false);
const submissionContent = ref(''),
  submissionMessage = ref(''),
  isSubmitting = ref(false),
  loadedSubmission = ref<HomeworkEntry | null>(null);
const { draftReady, draftState, draftError, flushDraft, reloadDraft } = useServerDraft(
  submissionContent,
  'homework',
  homeworkId,
);
async function reloadSaved() {
  if (
    submissionContent.value &&
    !window.confirm('Загрузить сохранённый черновик? Текущий текст будет заменён.')
  )
    return;
  await reloadDraft();
}
let request = 0;
watch(
  homeworkId,
  async (id) => {
    const current = ++request;
    metadataReady.value = false;
    loadedSubmission.value = null;
    submissionMessage.value = '';
    homeworkTitle.value = 'Загрузка задания…';
    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL || '/api'}/homework/${id}`);
      if (current !== request) return;
      homeworkTitle.value = data.title;
      homeworkDescription.value = data.description;
      courseContextId.value = data.courseSlug;
      courseTitle.value = data.courseTitle;
      loadedSubmission.value = data.submission
        ? { ...data.submission, homeworkId: id, homeworkTitle: data.title }
        : null;
      metadataReady.value = true;
    } catch {
      if (current === request) {
        homeworkTitle.value = 'Не удалось загрузить задание';
        homeworkDescription.value = 'Обновите страницу и повторите попытку.';
      }
    }
  },
  { immediate: true },
);
const currentSubmission = computed(
  () =>
    loadedSubmission.value ||
    userProfileStore.profile.homeworkHistory.find((item) => item.homeworkId === homeworkId.value),
);
const formattedSubmissionDate = computed(() =>
  currentSubmission.value
    ? new Date(currentSubmission.value.submissionDate).toLocaleDateString('ru-RU')
    : '',
);
async function submitHomework() {
  if (isSubmitting.value || !metadataReady.value || !submissionContent.value.trim()) return;
  isSubmitting.value = true;
  submissionMessage.value = '';
  try {
    if (!(await flushDraft())) return;
    const saved = await userProfileStore.addHomeworkSubmission({
      homeworkId: homeworkId.value,
      homeworkTitle: homeworkTitle.value,
      submittedContent: submissionContent.value,
    });
    if (!saved) {
      submissionMessage.value = 'Не удалось сдать задание. Ваш текст сохранён в черновике.';
      return;
    }
    submissionMessage.value = 'Задание успешно сдано!';
    loadedSubmission.value =
      userProfileStore.profile.homeworkHistory.find(
        (item) => item.homeworkId === homeworkId.value,
      ) || null;
    submissionContent.value = '';
    await flushDraft();
  } finally {
    isSubmitting.value = false;
  }
}
const goBack = () => {
  if (window.history.length > 1) router.go(-1);
  else void router.push('/courses');
};
</script>

<style scoped>
.homework-detail-view {
  padding-bottom: var(--space-8);
}

.back-link {
  margin-bottom: var(--space-5);
  padding-left: var(--space-2);
  padding-right: var(--space-3);
}

.hw-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.hw-header .page-title {
  margin-bottom: var(--space-2);
}
.hw-description {
  line-height: 1.6;
  margin-bottom: var(--space-2);
}

.course-context {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--muted-text);
  margin: 0;
}
.course-context :deep(svg) {
  color: var(--faint-text);
  flex-shrink: 0;
}

/* Submission form */
.submission-area {
  margin-bottom: var(--space-6);
}
.submission-hint {
  font-size: var(--text-sm);
  line-height: 1.6;
  margin-bottom: var(--space-4);
}

.submission-area textarea {
  resize: vertical;
}

.submission-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}

.submission-feedback {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  margin-bottom: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--info-bg);
  color: var(--info-text);
}
.submission-feedback.is-success {
  background: var(--success-bg);
  color: var(--success-text);
}
.submission-feedback.is-error {
  background: var(--danger-bg);
  color: var(--danger-text);
}

/* Current submission */
.current-submission-status .section-head {
  margin-bottom: var(--space-4);
}

.submission-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}
.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
}
.detail-row dt {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-text);
}
.detail-row dt :deep(svg) {
  color: var(--faint-text);
}
.detail-row dd {
  margin: 0;
  color: var(--text-color);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-analysis {
  padding: var(--space-5);
  border-radius: var(--radius);
  background: var(--primary-soft);
  border-left: 4px solid var(--primary-color);
}
.ai-analysis-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary-color);
  margin-bottom: var(--space-3);
}
.ai-analysis-head h3 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-color);
}
.ai-analysis-text {
  margin: 0;
  color: var(--text-color);
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
