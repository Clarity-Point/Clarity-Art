<template>
  <div class="page page-narrow breathing-page">
    <header class="breathing-header">
      <span class="medallion"><Icon name="wind" :size="24" /></span>
      <div>
        <h1 class="page-title display">Дыхательные практики</h1>
        <p class="page-subtitle">
          Несколько спокойных вдохов и выдохов помогают телу почувствовать опору здесь и сейчас.
        </p>
      </div>
    </header>

    <div class="technique-selector" role="tablist" aria-label="Выбор техники дыхания">
      <button
        v-for="ex in exercises"
        :key="ex.id"
        type="button"
        role="tab"
        class="technique-chip"
        :class="{ active: currentEx.id === ex.id }"
        :aria-selected="currentEx.id === ex.id"
        @click="selectExercise(ex)"
      >
        {{ ex.name }}
      </button>
    </div>

    <div class="breathing-stage">
      <div class="breathing-rings" :class="{ resting: !isActive }">
        <span class="ring ring-outer" aria-hidden="true"></span>
        <span class="ring ring-mid" aria-hidden="true"></span>
        <div class="breathing-circle" :style="circleStyle">
          <span class="phase-label">{{ phaseText }}</span>
          <span v-if="isActive" class="phase-timer">{{ timer }}</span>
          <span v-else class="phase-hint">Готовы начать?</span>
        </div>
      </div>
    </div>

    <div class="breathing-controls">
      <button type="button" class="btn-primary btn-lg" @click="toggle">
        <Icon :name="isActive ? 'pause' : 'play'" :size="18" />
        {{ isActive ? 'Остановить' : 'Начать практику' }}
      </button>
      <p class="controls-hint">Дышите свободно, без усилия — просто следуйте за кругом.</p>
    </div>

    <div class="card instructions-card">
      <span class="medallion medallion-accent"><Icon name="leaf" :size="20" /></span>
      <div>
        <h2 class="section-title">{{ currentEx.name }}</h2>
        <p class="muted">{{ currentEx.description }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import Icon from '@/components/Icon.vue';

const exercises = [
  {
    id: 'square',
    name: 'Квадратное дыхание',
    description: 'Вдох (4с), Задержка (4с), Выдох (4с), Задержка (4с)',
    phases: [4, 4, 4, 4],
    texts: ['Вдох', 'Задержка', 'Выдох', 'Задержка'],
  },
  {
    id: '478',
    name: 'Техника 4-7-8',
    description: 'Вдох (4с), Задержка (7с), Выдох (8с)',
    phases: [4, 7, 8],
    texts: ['Вдох', 'Задержка', 'Выдох'],
  },
  {
    id: 'relax',
    name: 'Релаксация',
    description: 'Вдох (4с), Выдох (6с)',
    phases: [4, 6],
    texts: ['Вдох', 'Выдох'],
  },
];

const currentEx = ref(exercises[0]);
const isActive = ref(false);
const phase = ref(0);
const timer = ref(0);
const scale = ref(1);

let interval: ReturnType<typeof setInterval> | undefined = undefined;

const phaseText = computed(() => currentEx.value.texts[phase.value]);
const circleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transition:
    phaseText.value === 'Задержка'
      ? 'none'
      : `transform ${currentEx.value.phases[phase.value]}s linear`,
}));

const selectExercise = (ex: (typeof exercises)[number]) => {
  stop();
  currentEx.value = ex;
};

const start = () => {
  isActive.value = true;
  runPhase();
};

const stop = () => {
  isActive.value = false;
  clearInterval(interval);
  phase.value = 0;
  timer.value = 0;
  scale.value = 1;
};

// View-only helper: single toggle for the primary control button.
const toggle = () => {
  if (isActive.value) stop();
  else start();
};

const runPhase = () => {
  if (!isActive.value) return;

  const duration = currentEx.value.phases[phase.value];
  timer.value = duration;

  if (phaseText.value === 'Вдох') {
    scale.value = 1.5;
  } else if (phaseText.value === 'Выдох') {
    scale.value = 1;
  }

  interval = setInterval(() => {
    timer.value--;
    if (timer.value <= 0) {
      clearInterval(interval);
      phase.value = (phase.value + 1) % currentEx.value.phases.length;
      runPhase();
    }
  }, 1000);
};

onUnmounted(() => stop());
</script>

<style scoped>
.breathing-page {
  display: flex;
  flex-direction: column;
}

.breathing-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.breathing-header .page-title {
  margin-bottom: var(--space-1);
}
.breathing-header .page-subtitle {
  margin-bottom: 0;
}

/* Technique selector */
.technique-selector {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-bottom: var(--space-7);
}

.technique-chip {
  padding: 8px 18px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--muted-text);
  font-size: var(--text-sm);
}

.technique-chip:hover:not(.active) {
  border-color: var(--border-strong);
  color: var(--text-color);
}

.technique-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--on-primary);
}

/* Breathing centerpiece */
.breathing-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5) 0 var(--space-6);
}

.breathing-rings {
  position: relative;
  width: 280px;
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  transition: opacity var(--transition);
}
.ring-outer {
  inset: 0;
}
.ring-mid {
  inset: 26px;
  border-color: var(--primary-soft);
}
.breathing-rings.resting .ring {
  opacity: 0.6;
}

.breathing-circle {
  width: 150px;
  height: 150px;
  border-radius: var(--radius-full);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--primary-color) 65%, var(--accent-color) 35%) 0%,
    var(--primary-hover) 100%
  );
  color: var(--on-primary);
  box-shadow:
    var(--shadow-lg),
    0 0 40px color-mix(in srgb, var(--primary-color) 40%, transparent);
  will-change: transform;
}

.phase-label {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.phase-timer {
  font-size: var(--text-3xl);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.phase-hint {
  font-size: var(--text-sm);
  opacity: 0.85;
}

/* Controls */
.breathing-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-7);
}

.controls-hint {
  margin: 0;
  max-width: 44ch;
  text-align: center;
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--muted-text);
}

/* Technique instructions */
.instructions-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}
.instructions-card h2 {
  margin-bottom: var(--space-1);
}
.instructions-card p {
  margin: 0;
}

@media (max-width: 480px) {
  .breathing-rings {
    width: 220px;
    height: 220px;
  }
  .breathing-circle {
    width: 120px;
    height: 120px;
  }
  .phase-timer {
    font-size: var(--text-2xl);
  }
}
</style>
