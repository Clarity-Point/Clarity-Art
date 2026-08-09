<template>
  <aside :class="['sidebar', { 'is-open': isOpen }]" aria-label="Основная навигация">
    <nav class="sb-nav">
      <template v-if="isAuthenticated">
        <p class="sb-label">Основное</p>
        <div class="sb-group">
          <RouterLink
            v-for="item in mainNav"
            :key="item.to"
            :to="item.to"
            class="sb-item"
            :exact-active-class="item.exact ? 'active' : ''"
            :active-class="item.exact ? '' : 'active'"
          >
            <span class="sb-ic"><Icon :name="item.icon" :size="19" /></span>
            <span class="sb-text">
              <span class="sb-name">{{ item.name }}</span>
              <span class="sb-desc">{{ item.desc }}</span>
            </span>
          </RouterLink>
        </div>

        <p class="sb-label">Практики</p>
        <div class="sb-group">
          <RouterLink
            v-for="item in practiceNav"
            :key="item.to"
            :to="item.to"
            class="sb-item"
            active-class="active"
          >
            <span class="sb-ic"><Icon :name="item.icon" :size="19" /></span>
            <span class="sb-text">
              <span class="sb-name">{{ item.name }}</span>
              <span class="sb-desc">{{ item.desc }}</span>
            </span>
          </RouterLink>
        </div>

        <p class="sb-label">Сообщество</p>
        <div class="sb-group">
          <RouterLink
            v-for="item in communityNav"
            :key="item.to"
            :to="item.to"
            class="sb-item"
            active-class="active"
          >
            <span class="sb-ic"><Icon :name="item.icon" :size="19" /></span>
            <span class="sb-text">
              <span class="sb-name">{{ item.name }}</span>
              <span class="sb-desc">{{ item.desc }}</span>
            </span>
          </RouterLink>
        </div>

        <template v-if="manageNav.length">
          <p class="sb-label">Управление</p>
          <div class="sb-group">
            <RouterLink
              v-for="item in manageNav"
              :key="item.to"
              :to="item.to"
              class="sb-item"
              active-class="active"
            >
              <span class="sb-ic"><Icon :name="item.icon" :size="19" /></span>
              <span class="sb-text">
                <span class="sb-name">{{ item.name }}</span>
                <span class="sb-desc">{{ item.desc }}</span>
              </span>
            </RouterLink>
          </div>
        </template>
      </template>

      <template v-else>
        <div class="sb-group">
          <RouterLink to="/login" class="sb-item" active-class="active">
            <span class="sb-ic"><Icon name="log-in" :size="19" /></span>
            <span class="sb-text"><span class="sb-name">Войти</span></span>
          </RouterLink>
          <RouterLink to="/register" class="sb-item" active-class="active">
            <span class="sb-ic"><Icon name="user-plus" :size="19" /></span>
            <span class="sb-text"><span class="sb-name">Регистрация</span></span>
          </RouterLink>
        </div>
      </template>
    </nav>

    <!-- Always-reachable help — the calm safety net -->
    <div v-if="isAuthenticated" class="sb-foot">
      <button class="sb-help" @click="showEmergency = true">
        <span class="sb-help-ic"><Icon name="heart" :size="18" /></span>
        <span class="sb-help-text">
          <span class="sb-help-title">Нужна помощь сейчас?</span>
          <span class="sb-help-sub">Контакты поддержки — рядом</span>
        </span>
      </button>
    </div>

    <EmergencyModal :show="showEmergency" @close="showEmergency = false" />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { storeToRefs } from 'pinia';
import Icon from '@/components/Icon.vue';
import EmergencyModal from '@/components/EmergencyModal.vue';

const authStore = useAuthStore();
const { isAuthenticated, isAdmin, user } = storeToRefs(authStore);

const isTherapist = computed(() => user.value?.role === 'THERAPIST');
const isOrgAdmin = computed(() => user.value?.role === 'ORG_ADMIN');

const showEmergency = ref(false);

defineProps<{ isOpen: boolean }>();
defineEmits(['close']);

const mainNav = [
  { to: '/', icon: 'home', name: 'Главная', desc: 'Обзор и быстрый старт', exact: true },
  { to: '/diary', icon: 'edit', name: 'Дневник', desc: 'Записать мысли и чувства' },
  { to: '/chat', icon: 'message-circle', name: 'Чат-поддержка', desc: 'Поговорить с ассистентом' },
  { to: '/image-analysis', icon: 'image', name: 'Анализ рисунка', desc: 'Понять образ и эмоции' },
  { to: '/courses', icon: 'book-open', name: 'Курсы', desc: 'Программы шаг за шагом' },
  { to: '/analytics', icon: 'activity', name: 'Аналитика', desc: 'Прогресс и настроение' },
];

const practiceNav = [
  { to: '/breathing', icon: 'wind', name: 'Дыхание', desc: 'Успокоиться за 3 минуты' },
  { to: '/art-therapy-music', icon: 'music', name: 'Музыка', desc: 'Звуки для расслабления' },
  { to: '/knowledge', icon: 'book', name: 'Библиотека', desc: 'Статьи и материалы' },
];

const communityNav = [
  { to: '/gallery', icon: 'image', name: 'Галерея', desc: 'Работы сообщества' },
  { to: '/challenges', icon: 'target', name: 'Челленджи', desc: 'Практиковаться вместе' },
  { to: '/leaderboard', icon: 'award', name: 'Прогресс', desc: 'Мягкая таблица активности' },
];

const manageNav = computed(() => {
  const items: { to: string; icon: string; name: string; desc: string }[] = [];
  if (isAdmin.value)
    items.push({ to: '/admin', icon: 'shield', name: 'Админ-панель', desc: 'Управление системой' });
  if (isTherapist.value)
    items.push({
      to: '/therapist',
      icon: 'users',
      name: 'Кабинет терапевта',
      desc: 'Ваши подопечные',
    });
  if (isOrgAdmin.value)
    items.push({ to: '/org-admin', icon: 'building', name: 'Организация', desc: 'Люди и доступы' });
  return items;
});
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: var(--header-h);
  left: 0;
  width: var(--sidebar-w);
  height: calc(100vh - var(--header-h));
  display: flex;
  flex-direction: column;
  z-index: 1002;
  /* Off-canvas by default (mobile); slid in on desktop below. */
  transform: translateX(-100%);
  transition: transform var(--transition);
  box-shadow: var(--shadow-md);
}
.sidebar.is-open {
  transform: translateX(0);
}

.sb-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-3) var(--space-5);
}

.sb-label {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--faint-text);
  margin: var(--space-4) var(--space-3) var(--space-2);
}
.sb-label:first-child {
  margin-top: 0;
}

.sb-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sb-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 9px var(--space-3);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text-color);
  transition:
    background-color var(--transition),
    color var(--transition);
}
.sb-item:hover {
  background: var(--hover-bg);
}

.sb-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  color: var(--muted-text);
  border: 1px solid var(--border-color);
  transition:
    background-color var(--transition),
    color var(--transition),
    border-color var(--transition);
}

.sb-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.sb-name {
  font-size: var(--text-sm);
  font-weight: 600;
}
.sb-desc {
  font-size: var(--text-xs);
  color: var(--faint-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Active — clear, unmistakable "you are here" */
.sb-item.active {
  background: var(--primary-soft);
}
.sb-item.active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
}
.sb-item.active .sb-name {
  color: var(--primary-color);
  font-weight: 700;
}
.sb-item.active .sb-ic {
  background: var(--primary-color);
  color: var(--on-primary);
  border-color: var(--primary-color);
}

/* Footer help card */
.sb-foot {
  padding: var(--space-3);
  border-top: 1px solid var(--border-color);
}
.sb-help {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid transparent;
  color: var(--text-color);
}
.sb-help:hover {
  border-color: var(--accent-color);
  background: var(--accent-soft);
}
.sb-help-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: var(--on-accent);
}
.sb-help-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.sb-help-title {
  font-size: var(--text-sm);
  font-weight: 700;
}
.sb-help-sub {
  font-size: var(--text-xs);
  color: var(--muted-text);
}

@media (min-width: 1024px) {
  .sidebar {
    transform: translateX(0);
    box-shadow: none;
  }
}
</style>
