<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Админ-панель</h1>
      <p class="page-subtitle">Управляйте курсами и проверяйте задания участников программы.</p>
    </header>

    <div class="tabs" role="group" aria-label="Раздел администрирования">
      <button
        :aria-pressed="activeTab === 'courses'"
        @click="activeTab = 'courses'"
        :class="['tab-btn', { active: activeTab === 'courses' }]"
      >
        <Icon name="book-open" :size="18" />
        Управление курсами
      </button>
      <button
        :aria-pressed="activeTab === 'submissions'"
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
                  <div class="row table-actions">
                    <button @click="openCourseModal(course)" class="btn-outline btn-sm">
                      <Icon name="edit" :size="15" /> Редактировать
                    </button>
                    <button @click="removeCourse(course)" class="btn-ghost btn-sm danger-action">
                      <Icon name="trash" :size="15" /> Удалить
                    </button>
                  </div>
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
      <div v-else-if="submissionsError" class="empty-state">
        <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
        <p>{{ submissionsError }}</p>
        <button class="btn-outline" @click="fetchSubmissions">
          <Icon name="refresh-cw" :size="16" />
          Повторить
        </button>
      </div>

      <div v-else class="empty-state">
        <span class="empty-icon"><Icon name="file-text" :size="32" /></span>
        <p>Пока никто не сдавал задания. Как только появятся работы, вы увидите их здесь.</p>
      </div>
    </section>

    <Teleport to="body">
      <!-- Course Edit Modal -->
      <div
        ref="courseDialog"
        tabindex="-1"
        aria-labelledby="course-dialog-title"
        v-if="showCourseModal"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="showCourseModal = false"
      >
        <div class="modal-content card">
          <div class="modal-head">
            <span class="medallion"><Icon name="book-open" :size="20" /></span>
            <h3 id="course-dialog-title">
              {{ editingCourse.id ? 'Редактировать курс' : 'Новый курс' }}
            </h3>
          </div>
          <form @submit.prevent="saveCourse">
            <div class="form-group">
              <label for="admin-field-1">ID (латиницей)</label>
              <input
                id="admin-field-1"
                v-model="editingCourse.id"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="my-course"
                :disabled="!!editingCourse._isEditing"
              />
            </div>
            <div class="form-group">
              <label for="admin-field-2">Название</label>
              <input id="admin-field-2" v-model="editingCourse.title" required />
            </div>
            <div class="form-group">
              <label for="admin-field-3">Описание</label>
              <textarea
                id="admin-field-3"
                v-model="editingCourse.description"
                rows="3"
                required
              ></textarea>
            </div>
            <div class="form-group">
              <label for="admin-field-4">Категория</label>
              <select id="admin-field-4" v-model="editingCourse.category">
                <option value="adult">Для взрослых</option>
                <option value="svo">После трудного опыта</option>
                <option value="child">Дети</option>
              </select>
            </div>
            <section v-if="editingCourse._isEditing" class="content-builder">
              <h4>Модули и уроки</h4>
              <div
                v-for="module in editingCourse.modules || []"
                :key="module.id || module.title"
                class="builder-block"
              >
                <div class="section-head compact-head">
                  <strong>{{ module.title }}</strong>
                  <button
                    v-if="module.id"
                    type="button"
                    class="btn-ghost btn-sm danger-action"
                    @click="removeModule(module.id)"
                  >
                    Удалить модуль
                  </button>
                </div>
                <div
                  v-for="lesson in module.lessons"
                  :key="lesson.id || lesson.title"
                  class="builder-row"
                >
                  <span>{{ lesson.title }}</span>
                  <button
                    v-if="lesson.id"
                    type="button"
                    class="icon-btn"
                    aria-label="Удалить урок"
                    @click="removeLesson(lesson.id)"
                  >
                    <Icon name="trash" :size="15" />
                  </button>
                </div>
                <div v-if="module.id" class="builder-add">
                  <input
                    :aria-label="`Название нового урока: ${module.title}`"
                    v-model="newLessonTitles[module.id]"
                    placeholder="Название нового урока"
                  />
                  <button type="button" class="btn-outline btn-sm" @click="addLesson(module.id)">
                    Добавить урок
                  </button>
                </div>
              </div>
              <div class="builder-add">
                <input
                  aria-label="Название нового модуля"
                  v-model="newModuleTitle"
                  placeholder="Название нового модуля"
                />
                <button type="button" class="btn-outline btn-sm" @click="addModule">
                  Добавить модуль
                </button>
              </div>

              <h4>Домашние задания</h4>
              <div
                v-for="homework in editingCourse.relatedHomework || []"
                :key="homework.id"
                class="builder-row"
              >
                <span>{{ homework.title }}</span>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label="Удалить задание"
                  @click="removeHomework(homework.id)"
                >
                  <Icon name="trash" :size="15" />
                </button>
              </div>
              <div class="builder-homework">
                <input
                  aria-label="Название задания"
                  v-model="newHomework.title"
                  placeholder="Название задания"
                />
                <textarea
                  aria-label="Описание задания"
                  v-model="newHomework.description"
                  rows="2"
                  placeholder="Описание задания"
                ></textarea>
                <button type="button" class="btn-outline btn-sm" @click="addHomework">
                  Добавить задание
                </button>
              </div>
            </section>
            <p v-else class="muted builder-hint">
              Сначала сохраните курс, затем добавьте модули, уроки и задания.
            </p>
            <div class="modal-actions">
              <button type="button" @click="showCourseModal = false" class="btn-ghost">
                Отмена
              </button>
              <button type="submit" class="btn-primary" :disabled="isSavingCourse">
                {{ isSavingCourse ? 'Сохраняем…' : 'Сохранить' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Grade Modal -->
      <div
        ref="gradeDialog"
        tabindex="-1"
        aria-labelledby="grade-dialog-title"
        v-if="showGradeModal"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="showGradeModal = false"
      >
        <div class="modal-content grade-modal card">
          <div class="modal-head">
            <span class="medallion medallion-accent"><Icon name="file-text" :size="20" /></span>
            <h3 id="grade-dialog-title">Проверка: {{ currentSub.homeworkTitle }}</h3>
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
              <label for="admin-field-5">Оценка (например, 5/5 или «Отлично»)</label>
              <input id="admin-field-5" v-model="gradeForm.grade" required />
            </div>
            <div class="form-group">
              <label for="admin-field-6">Отзыв / анализ</label>
              <textarea
                id="admin-field-6"
                v-model="gradeForm.analysisText"
                rows="5"
                placeholder="Напишите конструктивный, поддерживающий отзыв..."
              ></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showGradeModal = false" class="btn-ghost">
                Отмена
              </button>
              <button type="submit" class="btn-primary">Сохранить оценку</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCoursesStore, type Course, type CourseDraft } from '@/stores/coursesStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import { useToastStore } from '@/stores/toastStore';
import { useFocusScope } from '@/composables/useFocusScope';
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
const toastStore = useToastStore();
const { courses } = storeToRefs(coursesStore);

const activeTab = ref('courses');
const showCourseModal = ref(false);
const editingCourse = ref<CourseDraft>({ id: '' });
const isSavingCourse = ref(false);
const newModuleTitle = ref('');
const newLessonTitles = ref<Record<string, string>>({});
const newHomework = ref({ title: '', description: '' });

const submissions = ref<Submission[]>([]);
const submissionsLoading = ref(false);
const submissionsError = ref('');
const showGradeModal = ref(false);
const currentSub = ref<Submission>(emptySubmission());
const gradeForm = ref({ grade: '', analysisText: '' });

const courseDialog = ref<HTMLElement | null>(null);
const gradeDialog = ref<HTMLElement | null>(null);
const overlayBackground = () => [...document.querySelectorAll<HTMLElement>('#app')];
useFocusScope(
  showCourseModal,
  courseDialog,
  () => {
    showCourseModal.value = false;
  },
  overlayBackground,
);
useFocusScope(
  showGradeModal,
  gradeDialog,
  () => {
    showGradeModal.value = false;
  },
  overlayBackground,
);

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
  submissionsError.value = '';
  try {
    const response = await axios.get(`${API_URL}/admin/submissions`);
    submissions.value = Array.isArray(response.data) ? response.data : [];
  } catch (e) {
    console.error(e);
    /*
     * Without this the list silently falls back to its empty state, so a failed
     * request looked exactly like "nobody has submitted anything" — and an
     * administrator would conclude there was nothing to grade.
     */
    submissions.value = [];
    submissionsError.value = 'Не удалось загрузить работы. Проверьте соединение.';
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
  // Drafts for modules, lessons and homework belong to whichever course was
  // open before. Keeping them meant a half-typed title reappeared pre-filled
  // when the next course's modal opened.
  newModuleTitle.value = '';
  newLessonTitles.value = {};
  newHomework.value = { title: '', description: '' };
  showCourseModal.value = true;
};

const saveCourse = async () => {
  isSavingCourse.value = true;
  const success = await coursesStore.saveCourse(editingCourse.value);
  isSavingCourse.value = false;
  if (success) {
    showCourseModal.value = false;
    toastStore.success('Курс сохранён.');
  } else {
    toastStore.error('Не удалось сохранить курс. Проверьте ID и заполненные поля.');
  }
};

const refreshEditingCourse = () => {
  const refreshed = courses.value.find((course) => course.id === editingCourse.value.id);
  if (refreshed) editingCourse.value = { ...refreshed, _isEditing: true };
};

const runContentAction = async (action: () => Promise<void>, success: string) => {
  try {
    await action();
    refreshEditingCourse();
    toastStore.success(success);
  } catch (error) {
    toastStore.error(
      axios.isAxiosError(error)
        ? error.response?.data?.error || 'Не удалось изменить содержимое курса.'
        : 'Не удалось изменить содержимое курса.',
    );
  }
};

const addModule = async () => {
  const title = newModuleTitle.value.trim();
  if (!title) return;
  await runContentAction(
    () => coursesStore.addModule(editingCourse.value.id, title),
    'Модуль добавлен.',
  );
  newModuleTitle.value = '';
};

const removeModule = (id: string) => {
  if (!window.confirm('Удалить модуль вместе с его уроками?')) return;
  runContentAction(() => coursesStore.deleteModule(id), 'Модуль удалён.');
};

const addLesson = async (moduleId: string) => {
  const title = newLessonTitles.value[moduleId]?.trim();
  if (!title) return;
  await runContentAction(() => coursesStore.addLesson(moduleId, title), 'Урок добавлен.');
  newLessonTitles.value[moduleId] = '';
};

const removeLesson = (id: string) => {
  if (!window.confirm('Удалить урок?')) return;
  runContentAction(() => coursesStore.deleteLesson(id), 'Урок удалён.');
};

const addHomework = async () => {
  const title = newHomework.value.title.trim();
  const description = newHomework.value.description.trim();
  if (!title || !description) return;
  await runContentAction(
    () => coursesStore.addHomework(editingCourse.value.id, title, description),
    'Задание добавлено.',
  );
  newHomework.value = { title: '', description: '' };
};

const removeHomework = (id: string) => {
  if (!window.confirm('Удалить домашнее задание?')) return;
  runContentAction(() => coursesStore.deleteHomework(id), 'Задание удалено.');
};

const removeCourse = async (course: Course) => {
  if (!window.confirm(`Удалить курс «${course.title}»?`)) return;
  const result = await coursesStore.deleteCourse(course.id);
  if (result.ok) toastStore.success('Курс удалён.');
  else toastStore.error(result.error);
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
    toastStore.success('Оценка и обратная связь сохранены.');
  } catch {
    toastStore.error('Не удалось сохранить оценку. Попробуйте ещё раз.');
  }
};
</script>

<style scoped>
.content-builder {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-color);
}
.builder-block {
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}
.compact-head {
  margin-bottom: var(--space-2);
}
.builder-row,
.builder-add {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.builder-add input {
  flex: 1;
}
.builder-homework {
  display: grid;
  gap: var(--space-2);
}
.builder-hint {
  margin-top: var(--space-3);
}
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
  z-index: var(--z-modal);
  padding: var(--space-5);
}

.modal-content {
  width: 100%;
  max-width: 500px;
  max-height: calc(100dvh - var(--space-7));
  overflow-y: auto;
  overscroll-behavior: contain;
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
