<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Курсы по арт-терапии</h1>
      <p class="page-subtitle">
        Программы и практики, которые помогут лучше понять себя и двигаться в своём темпе.
      </p>
    </header>

    <div class="filters">
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="selectedCategory = cat.id"
        :class="['chip filter-chip', { active: selectedCategory === cat.id }]"
      >
        {{ cat.name }}
      </button>
    </div>

    <div v-if="isLoading" class="grid grid-auto">
      <div v-for="n in 2" :key="n" class="course-card">
        <div class="skeleton cover-skeleton"></div>
        <div class="course-body">
          <div class="skeleton" style="height: 22px; width: 70%; margin-bottom: 12px"></div>
          <div class="skeleton" style="height: 14px; width: 100%; margin-bottom: 6px"></div>
          <div class="skeleton" style="height: 14px; width: 60%"></div>
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ errorMessage }}</p>
      <button class="btn-outline" @click="coursesStore.fetchCourses()">Повторить</button>
    </div>

    <div v-else-if="filteredCourses.length" class="grid grid-auto">
      <article
        v-for="course in filteredCourses"
        :key="course.id"
        class="course-card card-hoverable"
      >
        <div class="cover" :class="`cover-${course.category}`">
          <img
            v-if="coverFor(course)"
            :src="coverFor(course)"
            :alt="course.title"
            class="cover-img"
            loading="lazy"
          />
          <span class="cover-badge chip">{{ categoryName(course.category) }}</span>
        </div>
        <div class="course-body">
          <h3 class="course-title">{{ course.title }}</h3>
          <p class="course-desc">{{ course.description }}</p>

          <div v-if="progressOf(course.slug) !== null" class="course-progress">
            <div class="progress">
              <span :style="{ width: progressOf(course.slug) + '%' }"></span>
            </div>
            <span class="progress-label faint"
              >{{ Math.round(progressOf(course.slug)!) }}% пройдено</span
            >
          </div>

          <RouterLink
            :to="{ name: 'CourseDetail', params: { courseId: course.slug } }"
            class="btn-primary course-cta"
          >
            {{ progressOf(course.slug) !== null ? 'Продолжить' : 'Начать курс' }}
            <Icon name="arrow-right" :size="18" />
          </RouterLink>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="book-open" :size="32" /></span>
      <p>В этой категории пока нет курсов.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useCoursesStore, type Course } from '@/stores/coursesStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import Icon from '@/components/Icon.vue';

import coverAdult from '@/assets/art-teropiya-dlya-samopoznaniya.jpeg';
import coverDifficultExperience from '@/assets/art-practice-difficult-experience.jpeg';
import coverChild from '@/assets/dlya-detei.jpeg';
import coverGeneral from '@/assets/vvedenie-v-art.jpeg';

const coversByCategory: Record<string, string> = {
  adult: coverAdult,
  svo: coverDifficultExperience,
  child: coverChild,
  general: coverGeneral,
};

const coursesStore = useCoursesStore();
const userProfileStore = useUserProfileStore();
const { courses, isLoading, errorMessage } = storeToRefs(coursesStore);

onMounted(() => coursesStore.fetchCourses());

const coverFor = (course: Course): string => {
  if (course.thumbnailUrl && /^https?:\/\//.test(course.thumbnailUrl)) return course.thumbnailUrl;
  return coversByCategory[course.category] || coverGeneral;
};

const progressOf = (courseId: string): number | null => {
  const entry = userProfileStore.profile.courseProgress?.find((cp) => cp.courseId === courseId);
  return entry ? entry.progress : null;
};

type CourseCategory = 'all' | 'svo' | 'adult' | 'child';
const categories = ref<{ id: CourseCategory; name: string }[]>([
  { id: 'all', name: 'Все курсы' },
  { id: 'svo', name: 'После трудного опыта' },
  { id: 'adult', name: 'Взрослым' },
  { id: 'child', name: 'Детям' },
]);
const categoryName = (c: string) =>
  (
    ({
      svo: 'После трудного опыта',
      adult: 'Взрослым',
      child: 'Детям',
      general: 'Общее',
    }) as Record<string, string>
  )[c] || 'Курс';

const selectedCategory = ref<CourseCategory>('all');
const filteredCourses = computed(() =>
  selectedCategory.value === 'all'
    ? courses.value
    : courses.value.filter((c) => c.category === selectedCategory.value),
);
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}
.filter-chip {
  cursor: pointer;
  padding: 8px 16px;
  font-size: var(--text-sm);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--muted-text);
  transition: all var(--transition);
}
.filter-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-color);
}
.filter-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--on-primary);
}

.course-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.cover {
  position: relative;
  height: 172px;
  background: linear-gradient(135deg, var(--primary-soft), var(--accent-soft));
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 55%, rgba(46, 42, 36, 0.35));
}
.cover-badge {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  z-index: 1;
  background: rgba(255, 252, 247, 0.92);
  color: var(--text-color);
  font-weight: 600;
  backdrop-filter: blur(4px);
}

.course-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  flex: 1;
}
.course-title {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.course-desc {
  color: var(--muted-text);
  font-size: var(--text-sm);
  line-height: 1.55;
  margin-bottom: var(--space-4);
  flex: 1;
}

.course-progress {
  margin-bottom: var(--space-4);
}
.progress-label {
  display: block;
  font-size: var(--text-xs);
  margin-top: var(--space-2);
}

.course-cta {
  align-self: flex-start;
  text-decoration: none;
}

.cover-skeleton {
  height: 172px;
  border-radius: 0;
}
</style>
