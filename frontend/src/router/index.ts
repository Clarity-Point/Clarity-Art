import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import MainView from '../views/MainView.vue';
import ImageAnalysisView from '../views/ImageAnalysisView.vue';
import AnalyticsView from '../views/AnalyticsView.vue';
import ChatView from '../views/ChatView.vue';
import UserProfileView from '../views/UserProfileView.vue';
import CoursesView from '../views/CoursesView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import AdminView from '../views/AdminView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { public: true },
    },
    {
      path: '/gallery',
      name: 'Gallery',
      component: () => import('../views/GalleryView.vue'),
    },
    {
      path: '/challenges',
      name: 'Challenges',
      component: () => import('../views/ChallengesView.vue'),
    },
    {
      path: '/org-admin',
      name: 'OrgAdmin',
      component: () => import('../views/OrgAdminView.vue'),
      meta: { requiresAuth: true, roles: ['ORG_ADMIN', 'ADMIN'] },
    },
    {
      path: '/therapist',
      name: 'Therapist',
      component: () => import('../views/TherapistView.vue'),
      meta: { requiresAuth: true, roles: ['THERAPIST', 'ADMIN'] },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAdmin: true },
    },
    {
      path: '/',
      name: 'main',
      component: MainView,
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/image-analysis',
      name: 'image-analysis',
      component: ImageAnalysisView,
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: AnalyticsView,
    },
    {
      path: '/profile',
      name: 'profile',
      component: UserProfileView,
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('../views/LeaderboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/courses',
      name: 'courses',
      component: CoursesView,
    },
    {
      path: '/diary',
      name: 'diary',
      component: () => import('../views/DiaryView.vue'),
    },
    {
      path: '/courses/:courseId',
      name: 'CourseDetail',
      component: () => import('../views/CourseDetailView.vue'),
      props: true,
    },
    {
      path: '/homework/:homeworkId',
      name: 'HomeworkDetail',
      component: () => import('../views/HomeworkDetailView.vue'),
      props: true,
    },
    {
      path: '/art-therapy-music',
      name: 'art-therapy-music',
      component: () => import('../views/ArtTherapyMusicView.vue'),
    },
    {
      path: '/breathing',
      name: 'breathing',
      component: () => import('../views/BreathingView.vue'),
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('../views/KnowledgeView.vue'),
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  if (!to.meta.public && !authStore.isAuthenticated) {
    await authStore.restoreSession();
  }

  if (!to.meta.public && !authStore.isAuthenticated) {
    next('/login');
  } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next('/');
  } else if (Array.isArray(to.meta.roles) && !to.meta.roles.includes(authStore.user?.role ?? '')) {
    // Role-gated area (therapist / org-admin). The backend is the real security
    // boundary — this just keeps users out of pages that would only error for them.
    next('/');
  } else {
    next();
  }
});

export default router;
