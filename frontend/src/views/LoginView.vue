<template>
  <main class="auth-page">
    <div class="auth-card">
      <aside class="auth-aside">
        <div class="aside-mark"><BrandLogo :size="30" /></div>
        <h2 class="display aside-title">Точка Ясности</h2>
        <p class="aside-text">
          Спокойное пространство для самопознания через арт-терапию — дневник, практики и поддержка,
          когда это нужно.
        </p>
        <ul class="aside-points">
          <li><Icon name="check" :size="16" /> Личный дневник и мягкая аналитика</li>
          <li><Icon name="check" :size="16" /> Поддерживающий ИИ-собеседник</li>
          <li><Icon name="check" :size="16" /> Курсы и дыхательные практики</li>
        </ul>
      </aside>

      <div class="auth-form-wrap">
        <router-link to="/" class="form-brand">
          <span class="form-brand-mark"><BrandLogo :size="20" /></span>
          <span class="form-brand-word display">Точка Ясности</span>
        </router-link>

        <h1 class="auth-title">С возвращением</h1>
        <p class="auth-sub muted">Войдите, чтобы продолжить свой путь.</p>

        <form @submit.prevent="handleLogin" class="auth-form">
          <div class="field">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              v-model="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div class="field">
            <label for="password">Пароль</label>
            <input
              type="password"
              id="password"
              v-model="password"
              required
              autocomplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <p v-if="error" class="error-message" role="alert">
            <Icon name="alert-triangle" :size="16" /> {{ error }}
          </p>

          <button type="submit" class="btn-primary btn-lg btn-block" :disabled="isLoading">
            {{ isLoading ? 'Входим…' : 'Войти' }}
          </button>
        </form>

        <p class="auth-switch muted">
          Нет аккаунта? <router-link to="/register">Зарегистрироваться</router-link>
        </p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import BrandLogo from '@/components/BrandLogo.vue';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const isLoading = ref(false);
const error = ref('');

async function handleLogin() {
  isLoading.value = true;
  error.value = '';
  const success = await authStore.login(email.value, password.value);
  if (success) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
  } else {
    error.value = 'Не удалось войти. Проверьте email и пароль.';
  }
  isLoading.value = false;
}
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(70% 60% at 15% 0%, var(--primary-soft) 0%, transparent 60%),
    radial-gradient(60% 50% at 100% 100%, var(--accent-soft) 0%, transparent 55%), var(--bg-color);
}

.auth-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  max-width: 920px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: auth-card-in 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes auth-card-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-card {
    animation: none;
  }
}

.auth-aside {
  padding: var(--space-7) var(--space-6);
  background:
    radial-gradient(120% 120% at 0% 0%, var(--primary-soft) 0%, transparent 55%),
    radial-gradient(120% 120% at 100% 100%, var(--accent-soft) 0%, transparent 55%), var(--bg-soft);
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-right: 1px solid var(--border-color);
}
.aside-mark {
  width: 52px;
  height: 52px;
  border-radius: var(--radius);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
}
.aside-title {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-3);
}
.aside-text {
  color: var(--muted-text);
  margin-bottom: var(--space-5);
  line-height: 1.6;
}
.aside-points {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.aside-points li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-color);
}
.aside-points :deep(.icon) {
  color: var(--primary-color);
}

.auth-form-wrap {
  padding: var(--space-7) var(--space-6);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.form-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  color: var(--text-color);
  width: fit-content;
}
.form-brand:hover {
  color: var(--text-color);
}
.form-brand-mark {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.form-brand-word {
  font-size: var(--text-lg);
  font-weight: 600;
}
.auth-title {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-1);
}
.auth-sub {
  margin-bottom: var(--space-5);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field label {
  margin: 0;
}

.error-message {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  background: var(--danger-bg);
  color: var(--danger-text);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

.auth-switch {
  margin: var(--space-5) 0 0;
  text-align: center;
  font-size: var(--text-sm);
}
.auth-switch a {
  font-weight: 600;
}

@media (max-width: 760px) {
  .auth-card {
    grid-template-columns: 1fr;
    max-width: 440px;
  }
  .auth-aside {
    display: none;
  }
}
</style>
