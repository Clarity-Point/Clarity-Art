<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Админ-панель</h1>
      <p class="page-subtitle">Управляйте курсами и проверяйте задания участников программы.</p>
    </header>

    <div class="tabs" role="tablist">
      <button
        role="tab"
        :aria-selected="activeTab === 'courses'"
        @click="activeTab = 'courses'"
        :class="['tab-btn', { active: activeTab === 'courses' }]"
      >
        <Icon name="book-open" :size="18" />
        Управление курсами
      </button>
      <button
        role="tab"
        :aria-selected="activeTab === 'submissions'"
        @click="activeTab = 'submissions'"
        :class="['tab-btn', { active: activeTab === 'submissions' }]"
      >
        <Icon name="file-text" :size="18" />
        Проверка заданий
        <span v-if="pendingCount" class="chip badge-warning tab-count">{{ pendingCount }}</span>
      </button>
    </div>

    <!-- Stat tiles -->
    <section class="stats-row">
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="book-open" :size="20" /></span>
        <div>
          <div class="stat-val">{{ courses.length }}</div>
          <div class="stat-lbl">курсов</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="file-text" :size="20" /></span>
        <div>
          <div class="stat-val">{{ submissions.length }}</div>
          <div class="stat-lbl">сданных работ</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="clock" :size="20" /></span>
        <div>
          <div class="stat-val">{{ pendingCount }}</div>
          <div class="stat-lbl">ожидают проверки</div>
        </div>
      </div>
    </section>

    <!-- Courses Management -->
    <section v-if="activeTab === 'courses'" class="tab-content">
      <div class="section-head">
        <h2 class="section-title">Курсы</h2>
        <button @click="openCourseModal()" class="btn-primary">
          <Icon name="plus" :size="18" />
          Добавить курс
        </button>
      </div>

      <div v-if="courses.length" class="card table-card">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Категория</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="course in courses" :key="course.id">
                <td class="mono muted">{{ course.id }}</td>
                <td class="cell-title">{{ course.title }}</td>
                <td>
                  <span class="chip badge-primary">{{ categoryLabel(course.category) }}</span>
                </td>
                <td>
                  <button @click="openCourseModal(course)" class="btn-outline btn-sm">
                    <Icon name="edit" :size="15" />
                    Редактировать
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon"><Icon name="book-open" :size="32" /></span>
        <p>Курсов пока нет. Создайте первый, чтобы он появился у пользователей.</p>
      </div>
    </section>

    <!-- Submissions Management -->
    <section v-if="activeTab === 'submissions'" class="tab-content">
      <div class="section-head">
        <h2 class="section-title">Сданные работы</h2>
      </div>

      <div v-if="submissionsLoading" class="card table-card">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Задание</th>
                <th>Дата сдачи</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in 3" :key="n">
                <td><div class="skeleton" style="height: 16px; width: 70%"></div></td>
                <td><div class="skeleton" style="height: 16px; width: 60%"></div></td>
                <td><div class="skeleton" style="height: 16px; width: 50%"></div></td>
                <td><div class="skeleton" style="height: 16px; width: 40%"></div></td>
                <td><div class="skeleton" style="height: 28px; width: 90px"></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="submissions.length" class="card table-card">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Задание</th>
                <th>Дата сдачи</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sub in submissions" :key="sub.userId + sub.homeworkId">
                <td>{{ sub.userEmail }}</td>
                <td class="cell-title">{{ sub.homeworkTitle }}</td>
                <td class="muted">{{ new Date(sub.submissionDate).toLocaleString('ru-RU') }}</td>
                <td>
                  <span :class="['chip', sub.grade ? 'badge-success' : 'badge-warning']">
                    <Icon :name="sub.grade ? 'check-circle' : 'clock'" :size="13" />
                    {{ sub.grade ? 'Оценено' : 'Ожидает' }}
                  </span>
                </td>
                <td>
                  <button @click="openGradeModal(sub)" class="btn-outline btn-sm">
                    <Icon name="edit" :size="15" />
                    Проверить
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon"><Icon name="file-text" :size="32" /></span>
        <p>Пока никто не сдавал задания. Как только появятся работы, вы увидите их здесь.</p>
      </div>
    </section>

    <!-- Course Edit Modal -->
    <div
      v-if="showCourseModal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="showCourseModal = false"
    >
      <div class="modal-content card">
        <div class="modal-head">
          <span class="medallion"><Icon name="book-open" :size="20" /></span>
          <h3>{{ editingCourse.id ? 'Редактировать курс' : 'Новый курс' }}</h3>
        </div>
        <form @submit.prevent="saveCourse">
          <div class="form-group">
            <label>ID (латиницей)</label>
            <input v-model="editingCourse.id" required :disabled="!!editingCourse._isEditing" />
          </div>
          <div class="form-group">
            <label>Название</label>
            <input v-model="editingCourse.title" required />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="editingCourse.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Категория</label>
            <select v-model="editingCourse.category">
              <option value="adult">Для взрослых</option>
              <option value="svo">После трудного опыта</option>
              <option value="child">Дети</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="showCourseModal = false" class="btn-ghost">Отмена</button>
            <button type="submit" class="btn-primary">Сохранить</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Grade Modal -->
    <div
      v-if="showGradeModal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="showGradeModal = false"
    >
      <div class="modal-content grade-modal card">
        <div class="modal-head">
          <span class="medallion medallion-accent"><Icon name="file-text" :size="20" /></span>
          <h3>Проверка: {{ currentSub.homeworkTitle }}</h3>
        </div>
        <p class="muted submitter-line">
          <strong class="text-color">От пользователя:</strong> {{ currentSub.userEmail }}
        </p>
        <div class="submission-text">
          <strong>Ответ пользователя</strong>
          <pre>{{ currentSub.submittedContent }}</pre>
        </div>
        <form @submit.prevent="submitGrade">
          <div class="form-group">
            <label>Оценка (например, 5/5 или «Отлично»)</label>
            <input v-model="gradeForm.grade" required />
          </div>
          <div class="form-group">
            <label>Отзыв / анализ</label>
            <textarea
              v-model="gradeForm.analysisText"
              rows="5"
              placeholder="Напишите конструктивный, поддерживающий отзыв..."
            ></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" @click="showGradeModal = false" class="btn-ghost">Отмена</button>
            <button type="submit" class="btn-primary">Сохранить оценку</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCoursesStore, type Course, type CourseDraft } from '@/stores/coursesStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import Icon from '@/components/Icon.vue';

interface Submission {
  userId: string;
  homeworkId: string;
  userEmail: string;
  homeworkTitle: string;
  submissionDate: string;
  submittedContent?: string;
  grade?: string;
  analysisText?: string;
}

const emptySubmission = (): Submission => ({
  userId: '',
  homeworkId: '',
  userEmail: '',
  homeworkTitle: '',
  submissionDate: '',
});

const API_URL = import.meta.env.VITE_API_URL || '/api';
const coursesStore = useCoursesStore();
const { courses } = storeToRefs(coursesStore);

const activeTab = ref('courses');
const showCourseModal = ref(false);
const editingCourse = ref<CourseDraft>({ id: '' });

const submissions = ref<Submission[]>([]);
const submissionsLoading = ref(false);
const showGradeModal = ref(false);
const currentSub = ref<Submission>(emptySubmission());
const gradeForm = ref({ grade: '', analysisText: '' });

const pendingCount = computed(() => submissions.value.filter((s) => !s.grade).length);

const categoryLabels: Record<string, string> = {
  adult: 'Для взрослых',
  svo: 'После трудного опыта',
  child: 'Дети',
};
const categoryLabel = (c: string) => categoryLabels[c] || c;

onMounted(async () => {
  await coursesStore.fetchCourses();
  fetchSubmissions();
});

const fetchSubmissions = async () => {
  submissionsLoading.value = true;
  try {
    const response = await axios.get(`${API_URL}/admin/submissions`);
    submissions.value = response.data;
  } catch (e) {
    console.error(e);
  } finally {
    submissionsLoading.value = false;
  }
};

const openCourseModal = (course?: Course) => {
  if (course) {
    editingCourse.value = { ...course, _isEditing: true };
  } else {
    editingCourse.value = { id: '', title: '', description: '', category: 'adult', modules: [] };
  }
  showCourseModal.value = true;
};

const saveCourse = async () => {
  const success = await coursesStore.saveCourse(editingCourse.value);
  if (success) {
    showCourseModal.value = false;
  }
};

const openGradeModal = (sub: Submission) => {
  currentSub.value = sub;
  gradeForm.value = {
    grade: sub.grade || '',
    analysisText: sub.analysisText || '',
  };
  showGradeModal.value = true;
};

const submitGrade = async () => {
  try {
    await axios.post(`${API_URL}/admin/submissions/grade`, {
      userId: currentSub.value.userId,
      homeworkId: currentSub.value.homeworkId,
      ...gradeForm.value,
    });
    showGradeModal.value = false;
    fetchSubmissions();
  } catch {
    alert('Ошибка при сохранении оценки');
  }
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: none;
  box-shadow: none;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--muted-text);
  margin-bottom: -1px;
}
.tab-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: transparent;
  color: var(--text-color);
}
.tab-btn.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  background: none;
}
.tab-count {
  margin-left: 2px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.stat-tile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.stat-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}
.stat-val {
  font-size: var(--text-2xl);
  font-weight: 700;
  line-height: 1.1;
}
.stat-lbl {
  font-size: var(--text-xs);
  color: var(--muted-text);
}

.tab-content {
  margin-top: var(--space-2);
}

.table-card {
  padding: 0;
  overflow: hidden;
}
.table-scroll {
  overflow-x: auto;
}
.table-card table {
  min-width: 560px;
}
.cell-title {
  font-weight: 600;
}
.mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--text-sm);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: var(--space-5);
}

.modal-content {
  width: 100%;
  max-width: 500px;
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.grade-modal {
  max-width: 700px;
}

.modal-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.modal-head h3 {
  margin: 0;
}

.submitter-line {
  margin-bottom: var(--space-4);
}
.submitter-line .text-color {
  color: var(--text-color);
}

.form-group {
  margin-bottom: var(--space-4);
}
.form-group label {
  display: block;
}

.submission-text {
  background: var(--bg-soft);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-5);
}
.submission-text strong {
  font-size: var(--text-sm);
  color: var(--muted-text);
}
.submission-text pre {
  white-space: pre-wrap;
  margin: var(--space-2) 0 0;
  color: var(--text-color);
  background: none;
  padding: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

@media (max-width: 720px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
  .tab-btn span.tab-count {
    margin-left: var(--space-1);
  }
}
</style>
