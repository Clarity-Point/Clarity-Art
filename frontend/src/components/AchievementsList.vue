<template>
  <div class="achievements-list">
    <div class="section-head">
      <h3 class="section-title">Мои достижения</h3>
      <span v-if="achievements.length" class="chip"
        >{{ earnedCount }} / {{ achievements.length }}</span
      >
    </div>

    <div v-if="achievements.length" class="grid grid-auto">
      <div
        v-for="ach in achievements"
        :key="ach.id"
        :class="['achievement-card', { earned: ach.earned }]"
      >
        <span class="medallion" :class="{ 'medallion-accent': ach.earned }">
          <Icon :name="iconFor(ach.icon)" :size="24" />
        </span>
        <div class="achievement-details">
          <span class="achievement-title">{{ ach.title }}</span>
          <p class="achievement-desc">{{ ach.description }}</p>
          <span v-if="ach.earned" class="earned-date">
            <Icon name="check" :size="11" /> Получено {{ formatDate(ach.earnedAt) }}
          </span>
          <span v-else class="locked-label">Ещё не открыто</span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="award" :size="28" /></span>
      <p>Достижений пока нет. Продолжайте заниматься — первые награды не за горами.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';

const props = defineProps<{
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    earned: boolean;
    earnedAt?: string;
  }>;
}>();

const formatDate = (date?: string) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU');
};

const earnedCount = computed(() => props.achievements.filter((a) => a.earned).length);

// Map a legacy emoji/icon key (or free-text hint) from the achievement data
// to one of the icons available in Icon.vue.
const iconMap: Record<string, string> = {
  streak: 'flame',
  fire: 'flame',
  '🔥': 'flame',
  course: 'book-open',
  book: 'book-open',
  '📚': 'book-open',
  diary: 'edit',
  entry: 'edit',
  '📝': 'edit',
  image: 'image',
  art: 'image',
  palette: 'palette',
  '🎨': 'palette',
  chat: 'message-circle',
  message: 'message-circle',
  '💬': 'message-circle',
  star: 'star',
  '⭐': 'star',
  trophy: 'trophy',
  '🏆': 'trophy',
  heart: 'heart',
  '❤️': 'heart',
  target: 'target',
  '🎯': 'target',
  sparkles: 'sparkles',
  '✨': 'sparkles',
};

const iconFor = (raw: string): string => {
  if (!raw) return 'award';
  if (iconMap[raw]) return iconMap[raw];
  const key = raw.toLowerCase();
  if (iconMap[key]) return iconMap[key];
  for (const [needle, icon] of Object.entries(iconMap)) {
    if (key.includes(needle)) return icon;
  }
  return 'award';
};
</script>

<style scoped>
.achievements-list {
  margin-top: var(--space-5);
}

.achievement-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  opacity: 0.6;
  filter: grayscale(0.6);
  transition:
    background-color var(--transition),
    border-color var(--transition),
    box-shadow var(--transition),
    opacity var(--transition),
    filter var(--transition),
    transform var(--transition);
}

.achievement-card.earned {
  opacity: 1;
  filter: grayscale(0);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.achievement-card.earned:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.achievement-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.achievement-title {
  font-weight: 600;
  color: var(--faint-text);
}

.achievement-card.earned .achievement-title {
  color: var(--text-color);
}

.achievement-desc {
  font-size: var(--text-sm);
  color: var(--faint-text);
  margin: 2px 0 var(--space-2);
}

.achievement-card.earned .achievement-desc {
  color: var(--muted-text);
}

.earned-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--success-bg);
  color: var(--success-text);
  padding: 3px 10px;
  border-radius: var(--radius-full);
}

.locked-label {
  align-self: flex-start;
  font-size: var(--text-xs);
  color: var(--faint-text);
}
</style>
