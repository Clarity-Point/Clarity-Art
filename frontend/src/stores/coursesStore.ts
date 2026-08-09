import { ref } from 'vue';
import { defineStore } from 'pinia';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface Lesson {
  id: string;
  title: string;
  content?: string | null;
  practices?: string[];
}

export interface Module {
  id?: string;
  title: string;
  lessons: Lesson[];
}

export interface RelatedHomework {
  id: string;
  title: string;
  description: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  category: 'svo' | 'adult' | 'child' | 'general';
  targetAudience?: string[];
  goals?: string[];
  modules: Module[];
  relatedHomework?: RelatedHomework[];
}

export type CourseDraft = Partial<Course> & { id: string; _isEditing?: boolean };

export const useCoursesStore = defineStore('courses', () => {
  const courses = ref<Course[]>([]);
  const currentCourse = ref<Course | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref('');

  async function fetchCourses() {
    isLoading.value = true;
    errorMessage.value = '';
    try {
      const response = await axios.get(`${API_URL}/courses`);
      courses.value = response.data;
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      courses.value = [];
      errorMessage.value = 'Не удалось загрузить курсы. Проверьте соединение.';
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchCourseById(id: string): Promise<Course | null> {
    isLoading.value = true;
    errorMessage.value = '';
    currentCourse.value = null;
    try {
      const response = await axios.get(`${API_URL}/courses/${id}`);
      currentCourse.value = response.data;
      return currentCourse.value;
    } catch (error) {
      console.error(`Failed to fetch course ${id}:`, error);
      errorMessage.value =
        axios.isAxiosError(error) && error.response?.status === 404
          ? 'Курс не найден.'
          : 'Не удалось загрузить курс. Проверьте соединение.';
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveCourse(course: CourseDraft) {
    try {
      if (course._isEditing) {
        const { _isEditing, ...courseData } = course;
        await axios.put(`${API_URL}/admin/courses/${course.id}`, courseData);
      } else {
        await axios.post(`${API_URL}/admin/courses`, course);
      }
      await fetchCourses();
      return true;
    } catch (error) {
      console.error('Failed to save course:', error);
      return false;
    }
  }

  async function deleteCourse(id: string) {
    try {
      await axios.delete(`${API_URL}/admin/courses/${id}`);
      await fetchCourses();
      return { ok: true, error: '' };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Не удалось удалить курс.'
        : 'Не удалось удалить курс.';
      return { ok: false, error: message };
    }
  }

  async function addModule(courseId: string, title: string) {
    await axios.post(`${API_URL}/admin/courses/${courseId}/modules`, { title });
    await fetchCourses();
  }

  async function deleteModule(id: string) {
    await axios.delete(`${API_URL}/admin/modules/${id}`);
    await fetchCourses();
  }

  async function addLesson(moduleId: string, title: string, content = '') {
    await axios.post(`${API_URL}/admin/modules/${moduleId}/lessons`, { title, content });
    await fetchCourses();
  }

  async function deleteLesson(id: string) {
    await axios.delete(`${API_URL}/admin/lessons/${id}`);
    await fetchCourses();
  }

  async function addHomework(courseId: string, title: string, description: string) {
    await axios.post(`${API_URL}/admin/courses/${courseId}/homework`, { title, description });
    await fetchCourses();
  }

  async function deleteHomework(id: string) {
    await axios.delete(`${API_URL}/admin/homework/${id}`);
    await fetchCourses();
  }

  return {
    courses,
    currentCourse,
    isLoading,
    errorMessage,
    fetchCourses,
    fetchCourseById,
    saveCourse,
    deleteCourse,
    addModule,
    deleteModule,
    addLesson,
    deleteLesson,
    addHomework,
    deleteHomework,
  };
});
