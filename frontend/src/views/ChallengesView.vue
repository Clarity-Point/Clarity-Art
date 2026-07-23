<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Групповые челленджи</h1>
      <p class="page-subtitle">Совместное творчество помогает двигаться вперёд быстрее.</p>
    </header>

    <div v-if="challenges.length" class="grid grid-auto">
      <article
        v-for="challenge in challenges"
        :key="challenge.id"
        class="challenge-card card-hoverable"
        :class="{ joined: challenge.joined }"
      >
        <div class="challenge-top row-between">
          <span class="medallion" :class="challenge.joined ? '' : 'medallion-accent'">
            <Icon :name="challenge.joined ? 'target' : 'award'" :size="22" />
          </span>
          <span class="chip badge-warning points-badge">
            <Icon name="star" :size="13" /> +{{ challenge.pointsAward }}
          </span>
        </div>

        <h3 class="challenge-title">{{ challenge.title }}</h3>
        <p class="challenge-desc muted">{{ challenge.description }}</p>

        <div class="challenge-meta row faint">
          <Icon name="calendar" :size="15" />
          <span>{{ formatDate(challenge.startDate) }} – {{ formatDate(challenge.endDate) }}</span>
        </div>

        <div v-if="challenge.joined" class="challenge-progress">
          <div class="progress">
            <span :style="{ width: timeProgress(challenge) + '%' }"></span>
          </div>
          <span class="progress-label faint">{{ timeProgressLabel(challenge) }}</span>
        </div>

        <button
          v-if="!challenge.joined"
          @click="join(challenge.id)"
          class="btn-primary btn-block join-btn"
        >
          <Icon name="user-plus" :size="16" />
          Участвовать
        </button>
        <span v-else class="status-msg">
          <Icon name="check-circle" :size="16" />
          Вы участвуете!
        </span>
      </article>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="target" :size="32" /></span>
      <p>Пока нет активных челленджей. Загляните позже — новые задания появляются регулярно.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import Icon from '@/components/Icon.vue';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Challenge {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  pointsAward: number;
  joined: boolean;
}

const challenges = ref<Challenge[]>([]);

const fetchChallenges = async () => {
  try {
    const response = await axios.get(`${API_URL}/challenges`);
    challenges.value = response.data;
  } catch (error) {
    console.error('Failed to fetch challenges:', error);
  }
};

onMounted(fetchChallenges);

const join = async (id: string) => {
  try {
    await axios.post(`${API_URL}/challenges/join`, { challengeId: id });
    await fetchChallenges();
  } catch (error) {
    console.error('Failed to join challenge:', error);
  }
};

// View-only helpers (display formatting only, no data/business logic changes)
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });

const timeProgress = (challenge: Challenge): number => {
  const start = new Date(challenge.startDate).getTime();
  const end = new Date(challenge.endDate).getTime();
  const now = Date.now();
  if (!(end > start)) return 0;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
};

const timeProgressLabel = (challenge: Challenge): string => {
  const pct = timeProgress(challenge);
  if (pct >= 100) return 'Челлендж завершается';
  return `Прошло ${Math.round(pct)}% времени`;
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.challenge-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.challenge-card.joined {
  border-color: var(--primary-color);
  background: var(--primary-soft);
}

.challenge-top {
  align-items: flex-start;
}

.points-badge {
  gap: 5px;
}

.challenge-title {
  margin: 0;
  font-size: var(--text-lg);
}

.challenge-desc {
  font-size: var(--text-sm);
  line-height: 1.55;
  flex: 1;
  margin: 0;
}

.challenge-meta {
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.challenge-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.progress-label {
  font-size: var(--text-xs);
}

.join-btn {
  margin-top: auto;
}

.status-msg {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--primary-color);
  font-weight: 600;
  font-size: var(--text-sm);
  padding: 10px;
}
</style>
