<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display row">
        <Icon name="trophy" :size="30" />
        Таблица лидеров
      </h1>
      <p class="page-subtitle">Лучшие участники нашего сообщества по количеству баллов.</p>
    </header>

    <div v-if="loading" class="stack">
      <div v-for="n in 5" :key="n" class="skeleton" style="height: 60px"></div>
    </div>

    <div v-else-if="error" class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="leaderboard.length" class="card leaderboard-card">
      <div
        v-for="user in leaderboard"
        :key="user.id"
        class="leader-row row-between"
        :class="{ 'is-me': isMe(user.id), 'is-top': user.rank <= 3 }"
      >
        <div class="row leader-main">
          <span class="rank-badge" :class="`rank-${user.rank <= 3 ? user.rank : 'other'}`">
            <Icon v-if="user.rank <= 3" name="award" :size="16" />
            <template v-else>{{ user.rank }}</template>
          </span>
          <span class="avatar">{{ initialsOf(user.name) }}</span>
          <div class="leader-name-wrap">
            <div class="leader-name">
              {{ user.name }}
              <span v-if="isMe(user.id)" class="chip badge-primary you-chip">Вы</span>
            </div>
            <div class="leader-sub faint row">
              <span class="chip level-chip">Ур. {{ user.level }}</span>
              <span class="streak-inline"><Icon name="flame" :size="13" /> {{ user.streak }}</span>
            </div>
          </div>
        </div>
        <div class="leader-points">{{ user.points }}</div>
      </div>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="trophy" :size="32" /></span>
      <p>Пока недостаточно данных для таблицы лидеров. Начните зарабатывать баллы!</p>
    </div>

    <section class="card gamification-info">
      <div class="section-head">
        <h3 class="section-title">Как получить баллы?</h3>
      </div>
      <ul class="points-list">
        <li class="points-item">
          <span class="medallion medallion-sm"><Icon name="edit" :size="16" /></span>
          Запись в дневнике — <b>10 баллов</b>
        </li>
        <li class="points-item">
          <span class="medallion medallion-sm"><Icon name="message-circle" :size="16" /></span>
          Сообщение в чате — <b>5 баллов</b>
        </li>
        <li class="points-item">
          <span class="medallion medallion-sm"><Icon name="palette" :size="16" /></span>
          Анализ рисунка — <b>15 баллов</b>
        </li>
        <li class="points-item">
          <span class="medallion medallion-sm"><Icon name="book-open" :size="16" /></span>
          Прохождение курсов — <b>2 балла</b> за 1%
        </li>
        <li class="points-item">
          <span class="medallion medallion-sm"><Icon name="check-circle" :size="16" /></span>
          Сдача домашнего задания — <b>30 баллов</b>
        </li>
        <li class="points-item">
          <span class="medallion medallion-sm medallion-accent"
            ><Icon name="flame" :size="16"
          /></span>
          Ежедневный вход — <b>20 баллов</b>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { useAuthStore } from '@/stores/authStore';
import Icon from '@/components/Icon.vue';

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  points: number;
  streak: number;
  level: number;
}

const leaderboard = ref<LeaderboardUser[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const userProfileStore = useUserProfileStore();
const authStore = useAuthStore();

const API_URL = import.meta.env.VITE_API_URL || '/api';

const isMe = (userId: string) => {
  return !!authStore.user?.id && authStore.user.id === userId;
};

onMounted(async () => {
  try {
    const response = await axios.get(`${API_URL}/leaderboard`);
    leaderboard.value = response.data;
  } catch {
    error.value = 'Не удалось загрузить таблицу лидеров';
  } finally {
    loading.value = false;
  }
});

// View-only helper (display formatting only)
const initialsOf = (name: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '·';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
};

void userProfileStore;
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}
.page-title.row {
  gap: var(--space-3);
  align-items: center;
}

.leaderboard-card {
  padding: var(--space-2);
  margin-bottom: var(--space-6);
}

.leader-row {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}
.leader-row:hover {
  background: var(--hover-bg);
}
.leader-row + .leader-row {
  margin-top: 2px;
}

.leader-row.is-top {
  background: var(--bg-soft);
}
.leader-row.is-me {
  background: var(--primary-soft);
}
.leader-row.is-me:hover {
  background: var(--primary-soft);
}

.leader-main {
  gap: var(--space-3);
  min-width: 0;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--muted-text);
  background: var(--hover-bg);
}
.rank-badge.rank-1 {
  background: var(--primary-soft);
  color: var(--primary-color);
}
.rank-badge.rank-2 {
  background: var(--info-bg);
  color: var(--info-text);
}
.rank-badge.rank-3 {
  background: var(--accent-soft);
  color: var(--accent-color);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
  color: var(--on-primary);
  font-size: var(--text-xs);
  font-weight: 700;
  flex-shrink: 0;
}

.leader-name-wrap {
  min-width: 0;
}
.leader-name {
  font-weight: 600;
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you-chip {
  padding: 2px 8px;
}

.leader-sub {
  gap: var(--space-3);
  margin-top: 2px;
  font-size: var(--text-xs);
}
.level-chip {
  background: var(--hover-bg);
  color: var(--muted-text);
  padding: 2px 8px;
}
.streak-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.leader-points {
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--success-text);
  flex-shrink: 0;
  padding-left: var(--space-3);
}

.gamification-info h3 {
  margin: 0;
}

.points-list {
  list-style: none;
  padding: 0;
  margin: var(--space-4) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
}

.points-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--muted-text);
}

.medallion-sm {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

@media (max-width: 560px) {
  .leader-points {
    font-size: var(--text-base);
  }
  .leader-sub {
    flex-wrap: wrap;
  }
}
</style>
