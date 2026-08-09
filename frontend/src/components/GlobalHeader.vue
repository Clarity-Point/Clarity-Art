<template>
  <header class="ui-header">
    <div class="header-inner-content">
      <button @click="toggleSidebar" class="icon-btn menu-btn" aria-label="Открыть меню">
        <Icon name="menu" :size="22" />
      </button>

      <button @click="goToHome" class="wordmark" type="button">
        <span class="mark"><BrandLogo :size="22" /></span>
        <span class="mark-text">Точка&nbsp;Ясности</span>
      </button>

      <div class="header-right">
        <button
          @click="toggleTheme"
          class="icon-btn"
          :aria-label="isDark ? 'Светлая тема' : 'Тёмная тема'"
        >
          <Icon :name="isDark ? 'sun' : 'moon'" :size="20" />
        </button>

        <div v-if="isAuthenticated" class="menu-wrapper" ref="notiRef">
          <button @click="toggleNoti" class="icon-btn noti-btn" aria-label="Уведомления">
            <Icon name="bell" :size="20" />
            <span v-if="unreadCount > 0" class="noti-dot">{{ unreadCount }}</span>
          </button>
          <transition name="pop">
            <div v-if="showNotifications" class="dropdown noti-dropdown">
              <div class="dropdown-head">Уведомления</div>
              <div v-if="notifications.length === 0" class="dropdown-empty">
                <Icon name="bell" :size="24" />
                <span>Пока пусто</span>
              </div>
              <button
                v-for="n in notifications"
                :key="n.id"
                :class="['noti-item', { unread: !n.isRead }]"
                @click="readNoti(n.id)"
              >
                <div class="noti-title">{{ n.title }}</div>
                <div class="noti-msg">{{ n.message }}</div>
                <small class="faint">{{ new Date(n.date).toLocaleDateString('ru-RU') }}</small>
              </button>
            </div>
          </transition>
        </div>

        <div v-if="isAuthenticated" class="menu-wrapper" ref="userRef">
          <button @click="toggleUser" class="user-trigger">
            <span class="avatar">{{ initials }}</span>
            <span class="user-name">{{ profile.name || 'Профиль' }}</span>
            <Icon name="chevron-down" :size="16" class="faint" />
          </button>
          <transition name="pop">
            <div v-if="showUser" class="dropdown user-dropdown">
              <div class="user-card">
                <span class="avatar avatar-lg">{{ initials }}</span>
                <div>
                  <div class="user-card-name">{{ profile.name || 'Пользователь' }}</div>
                  <div class="faint user-card-email">{{ user?.email }}</div>
                </div>
              </div>
              <div class="user-stats">
                <div class="mini-stat">
                  <Icon name="sparkles" :size="16" class="stat-star" />
                  <span
                    ><b>{{ profile.points || 0 }}</b> очков роста</span
                  >
                </div>
              </div>
              <RouterLink to="/profile" class="menu-link" @click="closeUser">
                <Icon name="user" :size="18" /> Мой профиль
              </RouterLink>
              <button class="menu-link danger" @click="handleLogout">
                <Icon name="log-out" :size="18" /> Выйти
              </button>
            </div>
          </transition>
        </div>

        <RouterLink v-else to="/login" class="btn-primary login-cta">
          <Icon name="log-in" :size="18" /> Войти
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import Icon from '@/components/Icon.vue';
import BrandLogo from '@/components/BrandLogo.vue';

const router = useRouter();
const authStore = useAuthStore();
const profileStore = useUserProfileStore();
const { isAuthenticated, user } = storeToRefs(authStore);
const { profile } = storeToRefs(profileStore);

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  isRead: boolean;
}

const notifications = ref<Notification[]>([]);
const showNotifications = ref(false);
const showUser = ref(false);
const notiRef = ref<HTMLElement | null>(null);
const userRef = ref<HTMLElement | null>(null);
const unreadCount = computed(() => notifications.value.filter((n) => !n.isRead).length);

const initials = computed(() => {
  const name = (profile.value.name || '').trim();
  if (!name) return '·';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
});

const toggleNoti = () => {
  showNotifications.value = !showNotifications.value;
  showUser.value = false;
};
const toggleUser = () => {
  showUser.value = !showUser.value;
  showNotifications.value = false;
};
const closeUser = () => {
  showUser.value = false;
};

const onClickOutside = (e: MouseEvent) => {
  if (notiRef.value && !notiRef.value.contains(e.target as Node)) showNotifications.value = false;
  if (userRef.value && !userRef.value.contains(e.target as Node)) showUser.value = false;
};

const fetchNotifications = async () => {
  if (!isAuthenticated.value) return;
  try {
    const res = await axios.get(`${API_URL}/notifications`);
    notifications.value = res.data;
  } catch {
    /* silent */
  }
};

const readNoti = async (id: string) => {
  try {
    await axios.put(`${API_URL}/notifications/${id}/read`);
    const noti = notifications.value.find((n) => n.id === id);
    if (noti) noti.isRead = true;
  } catch {
    /* silent */
  }
};

const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
};

let pollId: number | undefined;

onMounted(() => {
  // Light-first: only go dark when the user has explicitly chosen it before.
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDark.value = true;
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  fetchNotifications();
  pollId = window.setInterval(fetchNotifications, 60000);
  document.addEventListener('click', onClickOutside);
});

onBeforeUnmount(() => {
  if (pollId) clearInterval(pollId);
  document.removeEventListener('click', onClickOutside);
});

const emit = defineEmits(['toggle-sidebar']);
const goToHome = () => router.push('/');
const toggleSidebar = () => emit('toggle-sidebar');
const handleLogout = async () => {
  await authStore.logout();
  showUser.value = false;
  await router.replace('/login');
};
</script>

<style scoped>
.ui-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 1000;
}

.header-inner-content {
  max-width: 1510px;
  margin: 0 auto;
  padding: 0 var(--space-5);
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.menu-btn {
  margin-right: var(--space-1);
}

.wordmark {
  margin-right: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-color);
  cursor: pointer;
  white-space: nowrap;
}
.wordmark:hover {
  background: var(--hover-bg);
}
.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--primary-color);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.menu-wrapper {
  position: relative;
}

.noti-btn {
  position: relative;
}
.noti-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--accent-color);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 5px 10px 5px 5px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid transparent;
}
.user-trigger:hover {
  background: var(--hover-bg);
  border-color: var(--border-color);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
  color: var(--on-primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.avatar-lg {
  width: 44px;
  height: 44px;
  font-size: var(--text-base);
}

.user-name {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-color);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-cta {
  text-decoration: none;
}

/* Dropdowns */
.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--elevated-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 1001;
  overflow: hidden;
}

.noti-dropdown {
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
}
.dropdown-head {
  padding: var(--space-3) var(--space-4);
  font-weight: 700;
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--border-color);
}
.dropdown-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--faint-text);
  font-size: var(--text-sm);
}
.noti-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  background: transparent;
}
.noti-item:hover {
  background: var(--hover-bg);
}
.noti-item.unread {
  background: var(--noti-unread-bg);
}
.noti-title {
  font-weight: 600;
  font-size: var(--text-sm);
  margin-bottom: 2px;
}
.noti-msg {
  font-size: var(--text-xs);
  color: var(--muted-text);
  margin-bottom: 2px;
  line-height: 1.45;
}

.user-dropdown {
  width: 260px;
  padding: var(--space-2);
}
.user-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
}
.user-card-name {
  font-weight: 700;
  font-size: var(--text-sm);
}
.user-card-email {
  font-size: var(--text-xs);
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-stats {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-2);
  margin-bottom: var(--space-1);
}
.mini-stat {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--muted-text);
}
.stat-star {
  color: var(--accent-color);
}

.menu-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
  padding: var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-color);
  font-weight: 500;
  font-size: var(--text-sm);
}
.menu-link:hover {
  background: var(--hover-bg);
}
.menu-link.danger {
  color: var(--danger-text);
}
.menu-link.danger:hover {
  background: var(--danger-bg);
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* On desktop the sidebar is always present, so the hamburger is redundant.
   The wordmark then aligns to sit directly above the rail. */
@media (min-width: 1024px) {
  .menu-btn {
    display: none;
  }
  .wordmark {
    min-width: calc(var(--sidebar-w) - var(--space-5) - var(--space-2));
  }
}

@media (max-width: 768px) {
  .header-inner-content {
    padding: 0 var(--space-3);
  }
  .user-name {
    display: none;
  }
}
</style>
