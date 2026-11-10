<template>
  <div v-if="isLoading" class="page page-narrow">
    <div
      class="skeleton"
      style="height: 260px; border-radius: var(--radius-lg); margin-bottom: var(--space-6)"
    ></div>
    <div class="skeleton" style="height: 28px; width: 50%; margin-bottom: 14px"></div>
    <div class="skeleton" style="height: 16px; width: 100%; margin-bottom: 8px"></div>
    <div class="skeleton" style="height: 16px; width: 80%"></div>
  </div>

  <div v-else-if="!course" class="page page-narrow">
    <div class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ errorMessage || 'Этот курс не найден. Возможно, он был перемещён или удалён.' }}</p>
      <RouterLink to="/courses" class="btn-outline" style="margin-top: var(--space-4)">
        <Icon name="arrow-left" :size="16" /> К списку курсов
      </RouterLink>
    </div>
  </div>

  <div v-else class="course-detail-view">
    <div class="course-hero">
      <img :src="coverSrc" :alt="course.title" class="hero-img" loading="lazy" />
      <div class="hero-overlay">
        <RouterLink to="/courses" class="hero-back">
          <Icon name="arrow-left" :size="16" /> Все курсы
        </RouterLink>
        <h1 class="hero-title display">{{ course.title }}</h1>
        <div class="hero-progress">
          <div class="progress"><span :style="{ width: currentCourseProgress + '%' }"></span></div>
          <span class="hero-progress-label">{{ currentCourseProgress }}% пройдено</span>
        </div>
      </div>
    </div>

    <div class="page course-body-grid">
      <div class="course-main stack">
        <p v-if="course.archivedAt" role="status">
          Курс в архиве. Материалы, задания и ваш прогресс остаются доступны.
        </p>
        <section class="card">
          <div class="section-head"><h2 class="section-title">О курсе</h2></div>
          <p class="course-description">{{ course.description }}</p>
        </section>

        <section
          v-if="selectedLesson"
          id="lesson-reader"
          class="card stack lesson-reader"
          aria-labelledby="lesson-heading"
        >
          <p class="muted">Урок {{ selectedIndex + 1 }} из {{ lessons.length }}</p>
          <h2 id="lesson-heading" tabindex="-1">{{ selectedLesson.title }}</h2>
          <VueMarkdown v-if="selectedLesson.content" :source="selectedLesson.content" />
          <p v-else class="muted">
            Материал этого урока пока готовится. Вы можете перейти к следующему уроку.
          </p>
          <div class="row lesson-navigation">
            <button
              class="btn-outline"
              :disabled="selectedIndex === 0"
              @click="openLesson(lessons[selectedIndex - 1]!.id)"
            >
              Предыдущий урок
            </button>
            <button
              class="btn-primary"
              :disabled="progressSaving"
              @click="toggleLesson(selectedLesson.id)"
            >
              {{
                isLessonCompleted(selectedLesson.id)
                  ? 'Снять отметку о прохождении'
                  : 'Урок пройден'
              }}
            </button>
            <button
              class="btn-outline"
              :disabled="selectedIndex === lessons.length - 1"
              @click="openLesson(lessons[selectedIndex + 1]!.id)"
            >
              Следующий урок
            </button>
          </div>
          <p v-if="positionError" role="alert">
            {{ positionError }}
            <button class="btn-ghost" @click="openLesson(selectedLesson.id)">
              Повторить сохранение позиции
            </button>
          </p>
        </section>
        <section v-if="course.targetAudience?.length" class="card">
          <div class="section-head"><h2 class="section-title">Для кого этот курс</h2></div>
          <ul class="tick-list">
            <li v-for="item in course.targetAudience" :key="item">
              <Icon name="check-circle" :size="18" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <section v-if="course.goals?.length" class="card">
          <div class="section-head"><h2 class="section-title">Цели курса</h2></div>
          <ul class="tick-list">
            <li v-for="goal in course.goals" :key="goal">
              <Icon name="target" :size="18" />
              <span>{{ goal }}</span>
            </li>
          </ul>
        </section>

        <section v-if="course.modules?.length">
          <div class="section-head"><h2 class="section-title">Содержание курса</h2></div>
          <div class="stack">
            <div v-for="(module, mIndex) in course.modules" :key="mIndex" class="card module-card">
              <div class="module-head">
                <span class="module-index">{{ mIndex + 1 }}</span>
                <h3 class="module-title">{{ module.title }}</h3>
              </div>
              <ul class="lesson-list">
                <li v-for="lesson in module.lessons" :key="lesson.id" class="lesson-item">
                  <button
                    type="button"
                    class="btn-ghost"
                    :aria-current="selectedLesson?.id === lesson.id ? 'step' : undefined"
                    @click="openLesson(lesson.id)"
                  >
                    Читать: {{ lesson.title }}
                  </button>
                  <label class="lesson-main">
                    <input
                      type="checkbox"
                      :disabled="progressSaving"
                      :checked="isLessonCompleted(lesson.id)"
                      @change="toggleLesson(lesson.id)"
                    />
                    <span :class="{ 'completed-text': isLessonCompleted(lesson.id) }">{{
                      lesson.title
                    }}</span>
                  </label>
                  <ul v-if="lesson.practices?.length" class="lesson-practices">
                    <li v-for="(practice, pIndex) in lesson.practices" :key="pIndex">
                      <Icon name="palette" :size="14" />
                      <span>{{ practice }}</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <aside class="course-side stack">
        <section v-if="course.relatedHomework?.length" class="card homework-panel">
          <div class="section-head"><h2 class="section-title">Домашние задания</h2></div>
          <div class="stack">
            <RouterLink
              v-for="hw in course.relatedHomework"
              :key="hw.id"
              :to="{
                name: 'HomeworkDetail',
                params: { homeworkId: hw.id },
                query: { courseContext: course.id },
              }"
              class="hw-card card-hoverable"
            >
              <span class="medallion medallion-accent"><Icon name="file-text" :size="20" /></span>
              <div class="hw-body">
                <h4 class="hw-title">{{ hw.title }}</h4>
                <p class="hw-desc muted">{{ hw.description }}</p>
                <span :class="['chip', getHomeworkStatus(hw.id).badge]">
                  {{ getHomeworkStatus(hw.id).text }}
                </span>
              </div>
              <Icon name="chevron-right" :size="18" class="hw-arrow" />
            </RouterLink>
          </div>
        </section>

        <section class="card progress-panel">
          <div class="section-head"><h2 class="section-title">Ваш прогресс</h2></div>
          <div class="progress-big">
            <span :style="{ transform: `scaleX(${currentCourseProgress / 100})` }"></span>
          </div>
          <p class="muted progress-hint">
            {{ progressHint }}
          </p>
          <p v-if="progressError" class="course-error" role="alert">{{ progressError }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import VueMarkdown from 'vue-markdown-render';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useCoursesStore } from '@/stores/coursesStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import Icon from '@/components/Icon.vue';

import coverAdult from '@/assets/images/art-teropiya-dlya-samopoznaniya.jpeg';
import coverDifficultExperience from '@/assets/images/art-practice-difficult-experience.jpeg';
import coverChild from '@/assets/images/dlya-detei.jpeg';
import coverGeneral from '@/assets/images/vvedenie-v-art.jpeg';

const coversByCategory: Record<string, string> = {
  adult: coverAdult,
  svo: coverDifficultExperience,
  child: coverChild,
  general: coverGeneral,
};

const route = useRoute();
const coursesStore = useCoursesStore();
const userProfileStore = useUserProfileStore();

const { currentCourse: course, isLoading, errorMessage } = storeToRefs(coursesStore);
const { profile } = storeToRefs(userProfileStore);

const courseId = computed(() => route.params.courseId as string);
const progressError = ref('');
const positionError = ref('');
const progressSaving = ref(false);
const selectedId = ref('');
const lessons = computed(() =>
  (course.value?.modules || []).flatMap((module) => module.lessons || []),
);
const selectedIndex = computed(() =>
  lessons.value.findIndex((lesson) => lesson.id === selectedId.value),
);
const selectedLesson = computed(() => lessons.value[selectedIndex.value]);
async function openLesson(id: string) {
  if (!lessons.value.some((lesson) => lesson.id === id)) return;
  selectedId.value = id;
  positionError.value = '';
  const slug = courseId.value;
  await nextTick();
  document.getElementById('lesson-heading')?.focus({ preventScroll: true });
  document.getElementById('lesson-reader')?.scrollIntoView({ block: 'start' });
  try {
    await axios.put(`${import.meta.env.VITE_API_URL || '/api'}/courses/${slug}/position`, {
      lessonId: id,
    });
    const entry = profile.value.courseProgress.find((item) => item.courseId === slug);
    if (entry) entry.lastLessonId = id;
  } catch {
    if (courseId.value === slug) positionError.value = 'Не удалось сохранить позицию чтения.';
  }
}

const loadCourse = async () => {
  progressError.value = '';
  if (courseId.value) {
    selectedId.value = '';
    await coursesStore.fetchCourseById(courseId.value);
    const resume = profile.value.courseProgress.find(
      (item) => item.courseId === courseId.value,
    )?.lastLessonId;
    selectedId.value =
      lessons.value.find((lesson) => lesson.id === resume)?.id || lessons.value[0]?.id || '';
  }
};

onMounted(loadCourse);

/*
 * Vue Router reuses the same component instance when only the params change, so
 * navigating /courses/a → /courses/b would otherwise keep course A's title,
 * modules and progress on screen under course B's URL. Reloading on param
 * change is what makes a direct link between two courses behave correctly.
 */
watch(courseId, loadCourse);

const isLessonCompleted = (lessonId: string) => {
  if (!course.value) return false;
  const progress = profile.value.courseProgress.find((cp) => cp.courseId === course.value?.id);
  return progress?.completedLessons?.includes(lessonId) || false;
};

const toggleLesson = async (lessonId: string) => {
  if (!course.value || progressSaving.value) return;

  const progressEntry = profile.value.courseProgress.find((cp) => cp.courseId === course.value?.id);
  let completedLessons = progressEntry ? [...(progressEntry.completedLessons || [])] : [];

  const index = completedLessons.indexOf(lessonId);
  if (index > -1) {
    completedLessons.splice(index, 1);
  } else {
    completedLessons.push(lessonId);
  }

  progressSaving.value = true;
  try {
    await updateProgress(completedLessons);
  } finally {
    progressSaving.value = false;
  }
};

const updateProgress = async (completedLessons: string[]) => {
  if (!course.value) return false;

  // `modules` is optional on the API response shape and `lessons` on a module
  // can be absent for a course mid-authoring. Reading them unguarded throws
  // inside the click handler and the view is left with a half-applied toggle.
  const totalLessons = (course.value.modules ?? []).reduce(
    (acc, mod) => acc + (mod.lessons?.length ?? 0),
    0,
  );
  const totalHomeworks = course.value.relatedHomework?.length || 0;

  const submittedHwCount =
    course.value.relatedHomework?.filter((hw) =>
      profile.value.homeworkHistory.some((sub) => sub.homeworkId === hw.id),
    ).length || 0;

  const totalItems = totalLessons + totalHomeworks;
  const completedItems = completedLessons.length + submittedHwCount;

  const newProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  progressError.value = '';
  const saved = await userProfileStore.updateCourseProgress({
    courseId: course.value?.id,
    courseName: course.value.title,
    progress: newProgress,
    completedLessons,
    lastAccessed: new Date().toISOString(),
    completedDate: newProgress === 100 ? new Date().toISOString() : undefined,
  });
  if (!saved) progressError.value = 'Не удалось сохранить прогресс. Попробуйте ещё раз.';
  return saved;
};

const currentCourseProgress = computed(() => {
  if (!course.value) return 0;
  const progress = profile.value.courseProgress.find((cp) => cp.courseId === course.value?.id);
  return progress?.progress || 0;
});

const getHomeworkStatus = (hwId: string) => {
  const submission = profile.value.homeworkHistory.find((h) => h.homeworkId === hwId);
  if (!submission) return { text: 'Начать выполнение', class: 'pending', badge: 'badge-warning' };
  if (submission.grade)
    return { text: `Оценка: ${submission.grade}`, class: 'graded', badge: 'badge-success' };
  return { text: 'На проверке', class: 'submitted', badge: 'badge-info' };
};

const getPlaceholder = (id: string) => {
  const assets: Record<string, string> = {
    'art-practice-difficult-experience': coverDifficultExperience,
    'adult-self-discovery': coverAdult,
  };
  return assets[id] || coverGeneral;
};

const coverSrc = computed(() => {
  if (!course.value) return coverGeneral;
  if (course.value.thumbnailUrl && /^https?:\/\//.test(course.value.thumbnailUrl)) {
    return course.value.thumbnailUrl;
  }
  return coversByCategory[course.value.category] || getPlaceholder(course.value.id) || coverGeneral;
});

const progressHint = computed(() => {
  const pct = currentCourseProgress.value;
  if (pct === 0) return 'Вы ещё не начали — отметьте первый урок, когда будете готовы.';
  if (pct < 100) return 'Двигайтесь в своём темпе, это не гонка.';
  return 'Курс пройден полностью. Заметили ли вы перемены в себе?';
});

watch(
  () => profile.value.homeworkHistory,
  () => {
    if (!course.value) return;
    const progress = profile.value.courseProgress.find((cp) => cp.courseId === course.value?.id);
    updateProgress(progress?.completedLessons || []);
  },
  { deep: true },
);
</script>

<style scoped>
.lesson-navigation {
  flex-wrap: wrap;
}
.lesson-reader {
  scroll-margin-top: var(--header-h);
  overflow-wrap: anywhere;
}
.lesson-reader :deep(img) {
  max-width: 100%;
  height: auto;
}
.lesson-reader :deep(pre) {
  overflow: auto;
  max-width: 100%;
}
.course-detail-view {
  min-width: 0;
  width: 100%;
  padding-bottom: var(--space-8);
}
.course-error {
  color: var(--danger-text);
  font-size: var(--text-sm);
}

/* Hero */
.course-hero {
  position: relative;
  height: 320px;
  overflow: hidden;
}
.hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.hero-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--space-6) var(--space-5);
  background: linear-gradient(
    180deg,
    rgba(46, 42, 36, 0.15) 0%,
    rgba(46, 42, 36, 0.05) 35%,
    rgba(30, 26, 20, 0.82) 100%
  );
}
.hero-back {
  position: absolute;
  top: var(--space-5);
  left: var(--space-5);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--on-image);
  font-size: var(--text-sm);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.28);
  padding: 8px 14px;
  border-radius: var(--radius-full);
  backdrop-filter: blur(6px);
  text-decoration: none;
  transition: background-color var(--transition);
}
.hero-back:hover {
  background: rgba(0, 0, 0, 0.42);
  color: var(--on-image);
}

.hero-title {
  color: var(--on-image);
  font-size: var(--text-3xl);
  margin-bottom: var(--space-4);
  max-width: 720px;
}

.hero-progress {
  max-width: 420px;
}
.hero-progress .progress {
  background: rgba(255, 255, 255, 0.25);
}
.hero-progress .progress > span {
  background: var(--on-image);
}
.hero-progress-label {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: rgba(255, 255, 255, 0.88);
  font-weight: 600;
}

/* Body grid */
.course-body-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 340px);
  gap: var(--space-6);
  align-items: start;
}

@media (max-width: 900px) {
  .course-body-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .course-side {
    order: -1;
  }
}

.course-description {
  color: var(--muted-text);
  line-height: 1.7;
  margin: 0;
}

.tick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.tick-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--text-color);
}
.tick-list li :deep(svg) {
  color: var(--primary-color);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Modules */
.module-card {
  padding: var(--space-5);
}
.module-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.module-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  font-weight: 700;
  font-size: var(--text-sm);
  flex-shrink: 0;
}
.module-title {
  margin: 0;
  font-size: var(--text-lg);
}

.lesson-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.lesson-item {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
}
.lesson-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  font-weight: 500;
}
.completed-text {
  text-decoration: line-through;
  color: var(--faint-text);
}

.lesson-practices {
  list-style: none;
  margin: var(--space-2) 0 0 30px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.lesson-practices li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted-text);
  font-size: var(--text-sm);
}
.lesson-practices li :deep(svg) {
  color: var(--accent-color);
  flex-shrink: 0;
}

/* Homework panel */
.homework-panel {
  padding: var(--space-5);
}
.hw-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  text-decoration: none;
  color: inherit;
}
.hw-body {
  flex: 1;
  min-width: 0;
}
.hw-title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-base);
  color: var(--text-color);
}
.hw-desc {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hw-arrow {
  color: var(--faint-text);
  flex-shrink: 0;
  margin-top: var(--space-2);
}

/* Progress panel */
.progress-panel {
  padding: var(--space-5);
}
.progress-big {
  height: 12px;
  width: 100%;
  background: var(--hover-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-3);
}
.progress-big > span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--primary-color);
  border-radius: var(--radius-full);
  transform-origin: left;
  transition: transform var(--transition);
}
.progress-hint {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
}
</style>

<style scoped>
.course-main,
.course-side {
  min-width: 0;
}
.hw-card {
  flex-wrap: wrap;
}
.hw-body .chip {
  max-width: 100%;
  white-space: normal;
}
</style>
