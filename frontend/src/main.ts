import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import axios from 'axios';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import './assets/theme.css';

// Apply the saved palette before the first Vue render to avoid a bright flash
// when a returning user prefers the dark theme.
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.config.errorHandler = (error, _instance, info) => {
  console.error('Unexpected UI error:', info, error);
  useToastStore(pinia).error(
    'Экран столкнулся с ошибкой. Обновите страницу или повторите действие.',
  );
};

// Attach a client generation to each request so a late 401 from an old
// account cannot invalidate a newer login. This is local metadata, not a header.
declare module 'axios' {
  interface AxiosRequestConfig {
    sessionRevision?: number;
  }
}
axios.interceptors.request.use((config) => {
  config.sessionRevision = useAuthStore(pinia).sessionRevision;
  return config;
});

let sessionRedirect: Promise<unknown> | null = null;
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const auth = useAuthStore(pinia);
    if (
      error?.response?.status === 401 &&
      auth.isAuthenticated &&
      error.config?.sessionRevision === auth.sessionRevision
    ) {
      auth.expireSession();
      if (!sessionRedirect) {
        useToastStore(pinia).info('Сессия завершилась. Войдите снова, чтобы продолжить.');
        sessionRedirect = router
          .replace({
            name: 'login',
            query: { redirect: router.currentRoute.value.fullPath },
          })
          .finally(() => {
            sessionRedirect = null;
          });
      }
      await sessionRedirect;
    }
    return Promise.reject(error);
  },
);

// Wait for the initial auth guard before mounting account-specific components.
// Otherwise the header can mount anonymously and skip its first notifications fetch.
router.isReady().then(() => app.mount('#app'));
