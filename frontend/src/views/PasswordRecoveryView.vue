<template>
  <main class="page page-narrow recovery-page">
    <form class="card stack" @submit.prevent="submit">
      <h1 class="page-title">{{ reset ? 'Новый пароль' : 'Восстановление доступа' }}</h1>
      <p v-if="!reset" class="muted">Отправим ссылку на адрес, указанный при регистрации.</p>
      <template v-if="!done">
        <label v-if="!reset"
          >Электронная почта<input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            maxlength="254"
        /></label>
        <template v-else
          ><label
            >Новый пароль<input
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
              required /></label
          ><label
            >Повторите пароль<input
              v-model="confirmation"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
              required /></label
        ></template>
        <button class="btn-primary" :disabled="busy || (reset && !token)">
          {{ busy ? 'Подождите…' : reset ? 'Сохранить пароль' : 'Отправить ссылку' }}
        </button>
      </template>
      <p role="status">{{ message }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <RouterLink v-if="reset && (!token || error)" to="/forgot-password"
        >Запросить новую ссылку</RouterLink
      >
      <RouterLink to="/login">Вернуться ко входу</RouterLink>
    </form>
  </main>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
const route = useRoute();
const reset = computed(() => route.name === 'reset-password');
const token = ref('');
const email = ref(''),
  password = ref(''),
  confirmation = ref(''),
  message = ref(''),
  error = ref(''),
  busy = ref(false),
  done = ref(false);
watch(
  () => [route.name, route.hash],
  () => {
    token.value = reset.value ? new URLSearchParams(route.hash.slice(1)).get('token') || '' : '';
    error.value = reset.value && !token.value ? 'В ссылке отсутствует код восстановления.' : '';
    message.value = '';
    done.value = false;
    password.value = '';
    confirmation.value = '';
    if (reset.value)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
  },
  { immediate: true },
);
async function submit() {
  if (busy.value) return;
  error.value = '';
  if (reset.value && password.value !== confirmation.value) {
    error.value = 'Пароли не совпадают.';
    return;
  }
  busy.value = true;
  try {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_URL || '/api'}/auth/${reset.value ? 'reset-password' : 'forgot-password'}`,
      reset.value
        ? { token: token.value, password: password.value }
        : { email: email.value.trim().toLowerCase() },
    );
    if (reset.value) useAuthStore().expireSession();
    message.value = data.message;
    done.value = true;
    password.value = '';
    confirmation.value = '';
  } catch (e) {
    error.value =
      axios.isAxiosError(e) && e.response?.status === 429
        ? 'Слишком много попыток. Повторите позже.'
        : axios.isAxiosError(e) &&
            e.response?.status === 400 &&
            typeof e.response.data?.error === 'string'
          ? e.response.data.error
          : 'Не удалось отправить запрос. Проверьте соединение и повторите позже.';
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.recovery-page {
  padding-top: var(--space-8);
}
label {
  display: grid;
  gap: var(--space-2);
}
</style>
