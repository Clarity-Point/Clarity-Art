<template>
  <div class="page">
    <h1 class="page-title display">Аналитика состояния</h1>
    <p class="page-subtitle">
      Карта настроения по вашим сессиям и наблюдения ИИ о том, что на неё влияет.
    </p>

    <!-- Stats -->
    <section class="stats-row" aria-label="Сводка">
      <template v-if="loading">
        <div class="stat-tile" v-for="i in 3" :key="i">
          <span
            class="skeleton"
            style="width: 42px; height: 42px; border-radius: var(--radius-sm); flex-shrink: 0"
          ></span>
          <div class="stack-tight">
            <span
              class="skeleton"
              style="width: 48px; height: 22px; display: block; margin-bottom: 6px"
            ></span>
            <span class="skeleton" style="width: 90px; height: 12px; display: block"></span>
          </div>
        </div>
      </template>
      <template v-else-if="hasMoodData">
        <div class="stat-tile">
          <span class="stat-ic"><Icon name="activity" :size="20" /></span>
          <div>
            <div class="stat-val">{{ totalSessions }}</div>
            <div class="stat-lbl">сессий в карте</div>
          </div>
        </div>
        <div class="stat-tile">
          <span class="stat-ic"><Icon name="smile" :size="20" /></span>
          <div>
            <div class="stat-val">{{ averageLabel }}</div>
            <div class="stat-lbl">среднее состояние</div>
          </div>
        </div>
        <div class="stat-tile">
          <span class="stat-ic"><Icon name="lightbulb" :size="20" /></span>
          <div>
            <div class="stat-val">{{ insightsCount }}</div>
            <div class="stat-lbl">найденных инсайтов</div>
          </div>
        </div>
      </template>
    </section>

    <div class="analytics-grid">
      <!-- Mood chart -->
      <section class="card chart-card">
        <div class="section-head">
          <h2 class="section-title">Карта настроения</h2>
          <span class="chip">последние 30 сессий</span>
        </div>
        <p class="section-caption">
          Каждая точка — одна сессия: чем выше, тем спокойнее вы себя чувствовали в тот момент.
        </p>

        <div v-if="loading" class="skeleton" style="height: 350px"></div>

        <template v-else-if="hasMoodData">
          <div class="chart-scroll">
            <apexchart
              type="line"
              height="350"
              :options="chartOptions"
              :series="chartSeries"
            ></apexchart>
          </div>
          <div class="chart-legend" role="list">
            <span class="legend-item" role="listitem">
              <span class="legend-dot legend-dot-calm"></span>Спокойствие
            </span>
            <span class="legend-item" role="listitem">
              <span class="legend-dot legend-dot-warn"></span>Тревога
            </span>
            <span class="legend-item" role="listitem">
              <span class="legend-dot legend-dot-crisis"></span>Кризис
            </span>
          </div>
        </template>

        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="bar-chart" :size="32" /></span>
          <p>
            Пока недостаточно записей для карты настроения. Она появится, как только накопится
            история сессий.
          </p>
        </div>
      </section>

      <!-- AI insights -->
      <section class="card insights-card">
        <div class="section-head">
          <h2 class="section-title">ИИ-инсайты</h2>
        </div>
        <p class="section-caption">
          Закономерности, которые ИИ заметил между вашим настроением, дневником и активностью.
        </p>

        <div v-if="loading" class="stack">
          <div class="skeleton" style="height: 64px" v-for="i in 3" :key="i"></div>
        </div>

        <div v-else-if="hasInsights" class="insight-list">
          <div v-for="(insight, idx) in correlations.insights" :key="idx" class="insight-item">
            <span class="medallion"><Icon name="lightbulb" :size="20" /></span>
            <p>{{ insight }}</p>
          </div>
        </div>

        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="sparkles" :size="32" /></span>
          <p>
            Недостаточно данных для инсайтов. Продолжайте вести дневник и отмечать метрики здоровья
            — и закономерности станут заметны.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import Icon from '@/components/Icon.vue';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Correlations {
  insights?: string[];
}

const chartSeries = ref([{ name: 'Состояние', data: [] as { x: number; y: number }[] }]);
const correlations = ref<Correlations>({});
const loading = ref(true);

const rootStyles = getComputedStyle(document.documentElement);
const themeToken = (name: string, fallback: string) =>
  rootStyles.getPropertyValue(name).trim() || fallback;

const chartPrimaryColor = themeToken('--primary-color', '#2563eb'); // blue — calm
const chartAccentColor = themeToken('--accent-color', '#1e3a8a'); // navy — marker
const chartMutedColor = themeToken('--muted-text', '#566483');
const chartBorderColor = themeToken('--border-color', '#e4eaf5');
const chartCardBg = themeToken('--card-bg', '#ffffff');
const chartFontFamily = themeToken('--font-sans', 'ui-sans-serif, system-ui, sans-serif');

const chartOptions = {
  chart: {
    id: 'mood-map',
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: chartFontFamily,
  },
  theme: { mode: 'light' },
  grid: { borderColor: chartBorderColor, strokeDashArray: 4 },
  xaxis: {
    type: 'datetime',
    labels: { datetimeFormatter: { day: 'dd MMM' }, style: { colors: chartMutedColor } },
    axisBorder: { color: chartBorderColor },
    axisTicks: { color: chartBorderColor },
  },
  yaxis: {
    min: 1,
    max: 3,
    tickAmount: 2,
    labels: {
      style: { colors: chartMutedColor },
      formatter: (val: number) => (val === 3 ? 'Спокойствие' : val === 2 ? 'Тревога' : 'Кризис'),
    },
  },
  stroke: { curve: 'smooth', width: 3, colors: [chartPrimaryColor] },
  colors: [chartPrimaryColor],
  markers: { size: 5, colors: [chartAccentColor], strokeColors: chartCardBg, strokeWidth: 2 },
  tooltip: { theme: 'light', x: { format: 'dd MMM yyyy' } },
  dataLabels: { enabled: false },
  legend: { show: false },
};

const totalSessions = computed(() => chartSeries.value[0].data.length);
const hasMoodData = computed(() => totalSessions.value > 0);

const averageLabel = computed(() => {
  const points = chartSeries.value[0].data;
  if (!points.length) return '—';
  const avg = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  if (avg >= 2.5) return 'Спокойствие';
  if (avg >= 1.5) return 'Тревога';
  return 'Кризис';
});

const hasInsights = computed(
  () => Array.isArray(correlations.value.insights) && correlations.value.insights.length > 0,
);
const insightsCount = computed(() => (correlations.value.insights?.length as number) || 0);

onMounted(async () => {
  try {
    const [moodRes, corrRes] = await Promise.all([
      axios.get(`${API_URL}/analytics/mood`),
      axios.get(`${API_URL}/analytics/correlations`),
    ]);

    chartSeries.value[0].data = moodRes.data.map((s: { date: string; score: number }) => ({
      x: new Date(s.date).getTime(),
      y: s.score,
    }));

    correlations.value = corrRes.data;
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.stat-tile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.stat-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}
.stat-val {
  font-size: var(--text-2xl);
  font-weight: 700;
  line-height: 1.1;
}
.stat-lbl {
  font-size: var(--text-xs);
  color: var(--muted-text);
}
.stack-tight {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.analytics-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--space-5);
  align-items: start;
}

.section-caption {
  color: var(--muted-text);
  font-size: var(--text-sm);
  margin: calc(-1 * var(--space-2)) 0 var(--space-4);
}

.chart-scroll {
  overflow-x: auto;
}

.chart-card :deep(.apexcharts-tooltip) {
  background: var(--card-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
  box-shadow: var(--shadow-md) !important;
}
.chart-card :deep(.apexcharts-tooltip-title) {
  background: var(--bg-soft) !important;
  border-color: var(--border-color) !important;
  color: var(--muted-text) !important;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-color);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--muted-text);
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.legend-dot-calm {
  background: var(--primary-color);
}
.legend-dot-warn {
  background: var(--warning-text);
}
.legend-dot-crisis {
  background: var(--danger-color);
}

.insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.insight-item {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  background: var(--primary-soft);
  color: var(--text-color);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
}
.insight-item p {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
}

@media (max-width: 900px) {
  .analytics-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
