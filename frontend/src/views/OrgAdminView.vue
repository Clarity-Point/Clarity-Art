<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">
        Ситуационный центр<span v-if="stats.orgName">: {{ stats.orgName }}</span>
      </h1>
      <p class="page-subtitle">
        Общая картина благополучия команды и рекомендации, на что стоит обратить внимание.
      </p>
    </header>

    <div v-if="loading" class="card skeleton" style="height: 220px"></div>
    <div v-else-if="loadError" class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ loadError }}</p>
      <button class="btn-outline" @click="fetchStats">Повторить</button>
    </div>

    <div v-else-if="stats.privacyProtected" class="card privacy-notice">
      <span class="medallion"><Icon name="shield" :size="22" /></span>
      <div>
        <h2 class="section-title">Статистика защищена</h2>
        <p class="muted">{{ stats.message }}</p>
        <p class="faint">
          Сейчас участников: {{ stats.memberCount || 0 }}. Минимум для групповой статистики:
          {{ stats.minimumGroupSize || 8 }}.
        </p>
      </div>
    </div>

    <template v-if="!loading && !loadError && !stats.privacyProtected">
      <div v-if="stats.executiveSummary" class="card ai-summary-card">
        <span class="medallion medallion-accent"><Icon name="sparkles" :size="22" /></span>
        <div class="summary-text">
          <h3>Сводка от ИИ</h3>
          <p>{{ stats.executiveSummary }}</p>
        </div>
      </div>

      <section class="stats-row">
        <div class="stat-tile">
          <span class="stat-ic"><Icon name="users" :size="20" /></span>
          <div>
            <div class="stat-val">{{ stats.memberCount || 0 }}</div>
            <div class="stat-lbl">сотрудников</div>
          </div>
        </div>
        <div class="stat-tile" v-for="risk in stats.riskStats" :key="risk.riskLevel">
          <span class="stat-ic" :style="riskIconStyle(risk.riskLevel)"
            ><Icon :name="riskIcon(risk.riskLevel)" :size="20"
          /></span>
          <div>
            <div class="stat-val">{{ risk._count }}</div>
            <div class="stat-lbl">{{ riskLabel(risk.riskLevel) }}</div>
          </div>
        </div>
      </section>

      <div class="grid grid-2">
        <section class="card chart-card">
          <div class="section-head">
            <h2 class="section-title">Динамика вовлечённости (7 дней)</h2>
          </div>
          <SimpleLineChart
            :points="trendPoints"
            :min-y="0"
            :height="200"
            aria-label="Количество активных участников за семь дней"
          />
        </section>

        <section class="card chart-card">
          <div class="section-head"><h2 class="section-title">Распределение состояний</h2></div>
          <div v-if="stats.riskStats?.length" class="risk-distribution">
            <div v-for="risk in stats.riskStats" :key="risk.riskLevel" class="risk-item">
              <div class="row-between risk-item-head">
                <span :class="['chip', riskBadgeClass(risk.riskLevel)]">{{
                  riskLabel(risk.riskLevel)
                }}</span>
                <span class="muted">{{ risk._count }}</span>
              </div>
              <div class="bar-container">
                <div
                  class="bar"
                  :style="{
                    width: (risk._count / (stats.memberCount || 1)) * 100 + '%',
                    backgroundColor: getRiskColor(risk.riskLevel),
                  }"
                ></div>
              </div>
            </div>
          </div>
          <p v-else class="muted">Данных для анализа пока недостаточно.</p>
        </section>
      </div>

      <section class="card heatmap-section">
        <div class="section-head">
          <h2 class="section-title">Карта психологического климата</h2>
          <div class="metric-toggles" role="group" aria-label="Метрика карты">
            <button
              type="button"
              :class="['toggle-btn', { active: heatmapMetric === 'stress' }]"
              @click="heatmapMetric = 'stress'"
            >
              Стресс
            </button>
            <button
              type="button"
              :class="['toggle-btn', { active: heatmapMetric === 'activity' }]"
              @click="heatmapMetric = 'activity'"
            >
              Активность
            </button>
          </div>
        </div>
        <div class="privacy-heatmap" role="table" aria-label="Групповая карта активности">
          <div class="heatmap-corner"></div>
          <div v-for="slot in heatmapSlotLabels" :key="slot" class="heatmap-axis">
            {{ slot }}
          </div>
          <template v-for="row in heatmapRows" :key="row.day">
            <div class="heatmap-day">{{ row.day }}</div>
            <button
              v-for="cell in row.cells"
              :key="cell.slot"
              type="button"
              class="heatmap-cell"
              :class="heatmapCellClass(cell.value)"
              :disabled="cell.count === 0"
              @click="showHeatmapDetails(row.day, cell.slot, cell.count)"
            >
              {{ cell.count > 0 ? cell.value : '—' }}
            </button>
          </template>
        </div>
        <p class="chart-hint muted">
          <Icon name="shield" :size="14" />
          Ячейка отображается только при наличии данных минимум от
          {{ stats.minimumGroupSize || 8 }} разных участников.
        </p>
      </section>

      <section v-if="stats.hrRecommendations?.length" class="card recommendations-section">
        <div class="section-head">
          <span class="medallion"><Icon name="lightbulb" :size="20" /></span>
          <h2 class="section-title">Рекомендуемые действия для HR</h2>
        </div>
        <ul class="rec-list">
          <li v-for="rec in stats.hrRecommendations" :key="rec">
            <Icon name="check" :size="16" />
            <span>{{ rec }}</span>
          </li>
        </ul>
      </section>
    </template>

    <section v-if="!loading && !loadError && stats.inviteCode" class="card invite-card">
      <span class="medallion"><Icon name="user-plus" :size="20" /></span>
      <div class="invite-text">
        <div class="invite-label muted">Код приглашения сотрудников</div>
        <div class="invite-code">{{ stats.inviteCode }}</div>
      </div>
      <button
        type="button"
        class="btn-outline btn-sm rotate-code"
        :disabled="isRotatingCode"
        @click="rotateInviteCode"
      >
        <Icon name="refresh-cw" :size="16" />
        {{ isRotatingCode ? 'Обновляем…' : 'Сменить код' }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import Icon from '@/components/Icon.vue';
import SimpleLineChart from '@/components/SimpleLineChart.vue';
import { useToastStore } from '@/stores/toastStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const toastStore = useToastStore();

interface RiskStat {
  riskLevel: string;
  _count: number;
}

interface HeatmapCell {
  totalRisk: number;
  count: number;
}

interface OrgStats {
  orgName: string;
  memberCount: number;
  riskStats: RiskStat[];
  heatmapData: Record<string, HeatmapCell>;
  trends: { date: string; _count: number }[];
  executiveSummary?: string;
  hrRecommendations?: string[];
  inviteCode?: string;
  privacyProtected?: boolean;
  minimumGroupSize?: number;
  message?: string;
}

const stats = ref<OrgStats>({
  orgName: '',
  memberCount: 0,
  riskStats: [],
  heatmapData: {},
  trends: [],
});
const heatmapMetric = ref('stress');
const loading = ref(true);
const loadError = ref('');
const isRotatingCode = ref(false);
const heatmapDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const heatmapTimeSlots = [0, 4, 8, 12, 16, 20];

const trendPoints = computed(() =>
  (stats.value.trends || []).map((trend) => ({ x: trend.date, y: trend._count })),
);
const heatmapSlotLabels = heatmapTimeSlots.map((hour) => `${hour}–${hour + 4}`);

const heatmapRows = computed(() =>
  heatmapDays.map((dayName, dayIndex) => {
    const jsDay = (dayIndex + 1) % 7;
    return {
      day: dayName,
      cells: heatmapTimeSlots.map((startHour) => {
        let totalVal = 0;
        let count = 0;
        for (let h = startHour; h < startHour + 4; h++) {
          const key = `${jsDay}-${h}`;
          if (stats.value.heatmapData?.[key]) {
            if (heatmapMetric.value === 'stress') {
              totalVal += stats.value.heatmapData[key].totalRisk;
              count += stats.value.heatmapData[key].count;
            } else {
              totalVal += stats.value.heatmapData[key].count;
              count += stats.value.heatmapData[key].count;
            }
          }
        }
        return {
          slot: `${startHour}–${startHour + 4}`,
          count,
          value:
            count > 0
              ? heatmapMetric.value === 'stress'
                ? Math.round(totalVal / count)
                : totalVal
              : 0,
        };
      }),
    };
  }),
);

const heatmapCellClass = (value: number) => {
  if (value === 0) return 'heatmap-empty';
  if (heatmapMetric.value === 'activity') return value >= 24 ? 'heatmap-high' : 'heatmap-low';
  return value >= 3 ? 'heatmap-high' : value >= 2 ? 'heatmap-mid' : 'heatmap-low';
};

const showHeatmapDetails = (day: string, slot: string, count: number) => {
  toastStore.info(`${day}, ${slot}: защищённый агрегат на основе ${count} наблюдений.`);
};

const fetchStats = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await axios.get(`${API_URL}/org/stats`);
    stats.value = {
      ...stats.value,
      ...response.data,
      riskStats: response.data.riskStats || [],
      heatmapData: response.data.heatmapData || {},
      trends: response.data.trends || [],
    };
  } catch (error) {
    console.error('Failed to fetch org stats:', error);
    loadError.value = 'Не удалось загрузить статистику организации.';
  } finally {
    loading.value = false;
  }
};

const rotateInviteCode = async () => {
  if (!window.confirm('Старый код перестанет работать. Создать новый?')) return;
  isRotatingCode.value = true;
  try {
    const response = await axios.post(`${API_URL}/org/rotate-invite`);
    stats.value.inviteCode = response.data.inviteCode;
    toastStore.success('Код приглашения обновлён.');
  } catch {
    toastStore.error('Не удалось обновить код приглашения.');
  } finally {
    isRotatingCode.value = false;
  }
};

onMounted(fetchStats);

const getRiskColor = (level: string) => {
  if (level === 'high') return '#f44336';
  if (level === 'medium') return '#ff9800';
  return '#4caf50';
};

// View-only helpers (display formatting; no business logic changed)
const riskLabel = (level: string) => {
  if (level === 'high') return 'Высокий риск';
  if (level === 'medium') return 'Средний риск';
  return 'Низкий риск';
};
const riskBadgeClass = (level: string) => {
  if (level === 'high') return 'badge-danger';
  if (level === 'medium') return 'badge-warning';
  return 'badge-success';
};
const riskIcon = (level: string) => {
  if (level === 'high') return 'alert-triangle';
  if (level === 'medium') return 'activity';
  return 'leaf';
};
const riskIconStyle = (level: string) => {
  if (level === 'high') return { background: 'var(--danger-bg)', color: 'var(--danger-text)' };
  if (level === 'medium') return { background: 'var(--warning-bg)', color: 'var(--warning-text)' };
  return { background: 'var(--success-bg)', color: 'var(--success-text)' };
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.privacy-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}
.privacy-notice p {
  margin: var(--space-2) 0 0;
}

.ai-summary-card {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  margin-bottom: var(--space-6);
}
.summary-text {
  min-width: 0;
}
.summary-text h3 {
  font-size: var(--text-sm);
  color: var(--muted-text);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.summary-text p {
  margin: 0;
  line-height: 1.55;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

.grid-2 {
  margin-bottom: var(--space-6);
}
.heatmap-header,
.section-head {
  margin-bottom: var(--space-4);
}

.metric-toggles {
  display: flex;
  gap: 4px;
  background: var(--hover-bg);
  padding: 4px;
  border-radius: var(--radius-sm);
}
.toggle-btn {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  box-shadow: none;
  color: var(--muted-text);
  font-size: var(--text-sm);
}
.toggle-btn:hover:not(:disabled) {
  background: transparent;
  color: var(--text-color);
}
.toggle-btn.active {
  background: var(--card-bg);
  color: var(--text-color);
  box-shadow: var(--shadow-sm);
}

.heatmap-section {
  margin-bottom: var(--space-6);
}
.privacy-heatmap {
  display: grid;
  grid-template-columns: 48px repeat(6, minmax(72px, 1fr));
  gap: 6px;
  overflow-x: auto;
}
.heatmap-axis,
.heatmap-day {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-text);
  font-size: var(--text-xs);
  font-weight: 600;
}
.heatmap-cell {
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-color);
  font-weight: 700;
  box-shadow: none;
}
.heatmap-cell:disabled {
  cursor: default;
  opacity: 0.55;
}
.heatmap-empty {
  background: var(--hover-bg);
}
.heatmap-low {
  background: var(--success-bg);
  color: var(--success-text);
}
.heatmap-mid {
  background: var(--warning-bg);
  color: var(--warning-text);
}
.heatmap-high {
  background: var(--danger-bg);
  color: var(--danger-text);
}
.chart-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  text-align: center;
  margin: var(--space-3) 0 0;
}

.risk-distribution {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.risk-item-head {
  margin-bottom: var(--space-2);
}
.bar-container {
  height: 10px;
  background: var(--hover-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.bar {
  height: 100%;
  border-radius: var(--radius-full);
}

.recommendations-section {
  margin-bottom: var(--space-6);
  background: var(--primary-soft);
  border-color: transparent;
}
.recommendations-section .section-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rec-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--text-color);
}
.rec-list :deep(svg) {
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
}

.invite-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.rotate-code {
  margin-left: auto;
}
.invite-label {
  font-size: var(--text-sm);
  margin-bottom: 2px;
}
.invite-code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--primary-color);
}

@media (max-width: 900px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
