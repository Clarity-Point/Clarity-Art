import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/authStore';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true, title: 'Вход' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { public: true, title: 'Регистрация' },
    },
    {
      path: '/gallery',
      name: 'Gallery',
      component: () => import('../views/GalleryView.vue'),
      meta: { title: 'Галерея' },
    },
    {
      path: '/challenges',
      name: 'Challenges',
      component: () => import('../views/ChallengesView.vue'),
      meta: { title: 'Челленджи' },
    },
    {
      path: '/org-admin',
      name: 'OrgAdmin',
      component: () => import('../views/OrgAdminView.vue'),
      meta: { requiresAuth: true, roles: ['ORG_ADMIN', 'ADMIN'], title: 'Организация' },
    },
    {
      path: '/therapist',
      name: 'Therapist',
      component: () => import('../views/TherapistView.vue'),
      meta: { requiresAuth: true, roles: ['THERAPIST', 'ADMIN'], title: 'Кабинет терапевта' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAdmin: true, title: 'Админ-панель' },
    },
    {
      path: '/',
      name: 'main',
      component: () => import('../views/MainView.vue'),
      meta: { title: 'Главная' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/ChatView.vue'),
      meta: { title: 'Чат-поддержка' },
    },
    {
      path: '/image-analysis',
      name: 'image-analysis',
      component: () => import('../views/ImageAnalysisView.vue'),
      meta: { title: 'Анализ рисунка' },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: () => import('../views/AnalyticsView.vue'),
      meta: { title: 'Аналитика' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/UserProfileView.vue'),
      meta: { title: 'Профиль' },
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('../views/LeaderboardView.vue'),
      meta: { requiresAuth: true, title: 'Таблица лидеров' },
    },
    {
      path: '/courses',
      name: 'courses',
      component: () => import('../views/CoursesView.vue'),
      meta: { title: 'Курсы' },
    },
    {
      path: '/diary',
      name: 'diary',
      component: () => import('../views/DiaryView.vue'),
      meta: { title: 'Дневник' },
    },
    {
      path: '/courses/:courseId',
      name: 'CourseDetail',
      component: () => import('../views/CourseDetailView.vue'),
      props: true,
      meta: { title: 'Курс' },
    },
    {
      path: '/homework/:homeworkId',
      name: 'HomeworkDetail',
      component: () => import('../views/HomeworkDetailView.vue'),
      props: true,
      meta: { title: 'Домашнее задание' },
    },
    {
      path: '/art-therapy-music',
      name: 'art-therapy-music',
      component: () => import('../views/ArtTherapyMusicView.vue'),
      meta: { title: 'Музыка' },
    },
    {
      path: '/breathing',
      name: 'breathing',
      component: () => import('../views/BreathingView.vue'),
      meta: { title: 'Дыхательные практики' },
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('../views/KnowledgeView.vue'),
      meta: { title: 'Библиотека знаний' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : 'Приложение';
  document.title = `${pageTitle} · Точка Ясности`;
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (!to.meta.public && !authStore.isAuthenticated) {
    await authStore.restoreSession();
  }

  if (!to.meta.public && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'main' };
  } else if (Array.isArray(to.meta.roles) && !to.meta.roles.includes(authStore.user?.role ?? '')) {
    // Role-gated area (therapist / org-admin). The backend is the real security
    // boundary — this just keeps users out of pages that would only error for them.
    return { name: 'main' };
  }
  if (to.meta.public && authStore.isAuthenticated) return { name: 'main' };
  return true;
});

export default router;
