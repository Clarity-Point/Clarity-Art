<template>
  <div class="ai-avatar" :class="moodClass" :title="'Уровень вашего аватара: ' + avatarName">
    <div class="avatar-icon">
      <Icon :name="avatarIconName" :size="26" />
    </div>
    <div class="avatar-info" v-if="showLabel">
      <span class="avatar-name">{{ avatarName }}</span>
      <div class="points-to-next" v-if="pointsToNext > 0">
        <Icon name="star" :size="12" />
        До следующего уровня: {{ pointsToNext }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';

const props = defineProps<{
  points: number;
  showLabel?: boolean;
  mood?: string;
}>();

const avatarLevel = computed(() => {
  if (props.points >= 500) return 4; // Древо
  if (props.points >= 200) return 3; // Цветок
  if (props.points >= 50) return 2; // Лист
  return 1; // Росток
});

const moodClass = computed(() => {
  if (props.mood === 'crisis') return 'mood-crisis';
  if (props.mood === 'warn') return 'mood-warn';
  if (props.mood === 'calm') return 'mood-calm';
  return '';
});

const avatarIconName = computed(() => {
  if (props.mood === 'crisis') return 'alert-triangle';
  if (props.mood === 'warn') return 'compass';
  if (props.mood === 'calm') return 'smile';

  const icons = ['sparkles', 'leaf', 'palette', 'trophy'];
  return icons[avatarLevel.value - 1];
});

const avatarName = computed(() => {
  if (props.mood === 'crisis') return 'Внимательный аватар';
  if (props.mood === 'warn') return 'Задумчивый аватар';

  const names = ['Росток надежды', 'Лист познания', 'Цветок гармонии', 'Древо мудрости'];
  return names[avatarLevel.value - 1];
});

const pointsToNext = computed(() => {
  if (avatarLevel.value === 1) return 50 - props.points;
  if (avatarLevel.value === 2) return 200 - props.points;
  if (avatarLevel.value === 3) return 500 - props.points;
  return 0;
});
</script>

<style scoped>
.ai-avatar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--primary-soft);
  color: var(--text-color);
  padding: 10px var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.avatar-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--card-bg);
  color: var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.avatar-info {
  display: flex;
  flex-direction: column;
}

.avatar-name {
  font-weight: 700;
  color: var(--primary-color);
  font-size: var(--text-lg);
}

.points-to-next {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--muted-text);
  margin-top: 2px;
}

.ai-avatar.mood-warn .avatar-icon,
.ai-avatar.mood-warn .avatar-name {
  color: var(--accent-color);
}

.ai-avatar.mood-crisis .avatar-icon,
.ai-avatar.mood-crisis .avatar-name {
  color: var(--danger-color);
}
</style>
