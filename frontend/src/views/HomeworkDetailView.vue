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
            getCourseTitle(courseContextId)
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
      ></textarea>
      <div class="submission-actions">
        <button
          type="button"
          class="btn-primary"
          @click="submitHomework"
          :disabled="!submissionContent.trim() || isSubmitting"
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
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { useCoursesStore } from '@/stores/coursesStore';
import { storeToRefs } from 'pinia';
import Icon from '@/components/Icon.vue';

const route = useRoute();
const router = useRouter();
const userProfileStore = useUserProfileStore();
const coursesStore = useCoursesStore();
const { profile } = storeToRefs(userProfileStore);

const homeworkId = ref<string | null>(null);
const homeworkTitle = ref<string>('Детали Задания');
const homeworkDescription = ref<string>('');
const courseContextId = ref<string | null>(null);

const submissionContent = ref('');
const submissionMessage = ref('');
const isSubmitting = ref(false);

const getCourseTitle = (id: string) =>
  coursesStore.currentCourse?.id === id ? coursesStore.currentCourse.title : 'Неизвестный курс';

const loadHomework = async () => {
  const idFromRoute = route.params.homeworkId as string;
  if (!idFromRoute) return;
  homeworkId.value = idFromRoute;

  // Reset everything the previous task left behind, otherwise moving from one
  // assignment to another shows the old title, description and submitted text
  // until the new fetch happens to resolve.
  homeworkTitle.value = 'Детали Задания';
  homeworkDescription.value = '';
  submissionContent.value = '';
  submissionMessage.value = '';
  courseContextId.value = null;

  // Homework metadata is served as part of its parent course (relatedHomework);
  // there is no standalone homework API. CourseDetailView links here with the
  // course id in ?courseContext, so we fetch that course and look the task up.
  let resolved = false;
  const courseContext = route.query.courseContext as string | undefined;
  if (courseContext) {
    courseContextId.value = courseContext;
    const course = await coursesStore.fetchCourseById(courseContext);
    const hw = course?.relatedHomework?.find((h) => h.id === idFromRoute);
    if (hw) {
      homeworkTitle.value = hw.title;
      homeworkDescription.value = hw.description;
      resolved = true;
    }
  }

  const existingSubmission = profile.value.homeworkHistory.find(
    (sub) => sub.homeworkId === homeworkId.value,
  );
  if (existingSubmission) {
    submissionContent.value = existingSubmission.submittedContent;
    submissionMessage.value = 'Вы уже сдавали это задание.';
    if (!resolved) {
      // Recover a readable title from the stored submission when course metadata is missing.
      homeworkTitle.value = existingSubmission.homeworkTitle;
      resolved = true;
    }
  }

  if (!resolved) {
    homeworkTitle.value = 'Задание не найдено';
    homeworkDescription.value = 'Информация о домашнем задании не найдена.';
  }
};

onMounted(loadHomework);

/*
 * The router reuses this instance across param changes, so going straight from
 * one assignment to another without leaving the view kept the old content.
 */
watch(
  () => [route.params.homeworkId, route.query.courseContext],
  () => {
    void loadHomework();
  },
);

const currentSubmission = computed(() => {
  if (!homeworkId.value) return null;
  return profile.value.homeworkHistory.find((sub) => sub.homeworkId === homeworkId.value);
});

const formattedSubmissionDate = computed(() => {
  if (!currentSubmission.value) return '';
  return new Date(currentSubmission.value.submissionDate).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
});

const submitHomework = async () => {
  if (!homeworkId.value || !submissionContent.value.trim()) {
    submissionMessage.value = 'Не удалось определить задание или содержимое пустое.';
    return;
  }

  isSubmitting.value = true;
  const saved = await userProfileStore.addHomeworkSubmission({
    homeworkId: homeworkId.value,
    homeworkTitle: homeworkTitle.value,
    submittedContent: submissionContent.value,
  });
  isSubmitting.value = false;
  if (!saved) {
    submissionMessage.value = 'Не удалось сдать задание. Ваш текст сохранён в форме.';
    return;
  }
  submissionMessage.value = 'Задание успешно сдано!';

  if (courseContextId.value) {
    const course =
      coursesStore.currentCourse?.id === courseContextId.value ? coursesStore.currentCourse : null;
    const courseProgress = profile.value.courseProgress.find(
      (cp) => cp.courseId === courseContextId.value,
    );
    const totalLessons =
      (course?.modules ?? []).reduce((acc, mod) => acc + (mod.lessons?.length ?? 0), 0) || 0;
    const homeworksForCourse = course?.relatedHomework || [];
    const submittedHomeworks = profile.value.homeworkHistory.filter((sub) =>
      homeworksForCourse.some((hw) => hw.id === sub.homeworkId),
    );

    const completedLessons = courseProgress?.completedLessons || [];
    const totalItems = totalLessons + homeworksForCourse.length;
    const completedItems = completedLessons.length + submittedHomeworks.length;
    const newProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    userProfileStore.updateCourseProgress({
      courseId: courseContextId.value,
      courseName: getCourseTitle(courseContextId.value),
      progress: newProgress,
      completedLessons,
      lastAccessed: new Date().toISOString(),
      completedDate: newProgress === 100 ? new Date().toISOString() : undefined,
    });
  }

  setTimeout(() => {
    submissionMessage.value = '';
  }, 3000);
};

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/courses');
  }
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
