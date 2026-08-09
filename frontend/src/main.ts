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

// A stale/expired cookie should produce one predictable transition to login,
// instead of leaving every screen to fail independently after a button click.
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401 && router.currentRoute.value.name !== 'login') {
      useAuthStore(pinia).expireSession();
      useToastStore(pinia).info('Сессия завершилась. Войдите снова, чтобы продолжить.');
      await router.replace({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
    return Promise.reject(error);
  },
);

app.mount('#app');
