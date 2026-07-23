import { ref } from 'vue';
import { defineStore } from 'pinia';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface Lesson {
  title: string;
  practices?: string[];
}

export interface Module {
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

  async function fetchCourses() {
    isLoading.value = true;
    try {
      const response = await axios.get(`${API_URL}/courses`);
      courses.value = response.data;
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchCourseById(id: string): Promise<Course | null> {
    isLoading.value = true;
    try {
      const response = await axios.get(`${API_URL}/courses/${id}`);
      currentCourse.value = response.data;
      return currentCourse.value;
    } catch (error) {
      console.error(`Failed to fetch course ${id}:`, error);
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

  return { courses, currentCourse, isLoading, fetchCourses, fetchCourseById, saveCourse };
});
