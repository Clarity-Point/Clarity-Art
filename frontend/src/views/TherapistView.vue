<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Кабинет терапевта</h1>
      <p class="page-subtitle">
        Наблюдайте за состоянием подопечных и открывайте детальный анализ по каждому.
      </p>
    </header>

    <section class="stats-row">
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="users" :size="20" /></span>
        <div>
          <div class="stat-val">{{ patients.length }}</div>
          <div class="stat-lbl">подопечных</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic" style="background: var(--danger-bg); color: var(--danger-text)"
          ><Icon name="alert-triangle" :size="20"
        /></span>
        <div>
          <div class="stat-val">{{ urgentCount }}</div>
          <div class="stat-lbl">требуют внимания</div>
        </div>
      </div>
    </section>

    <div v-if="isLoading" class="empty-state">
      <span class="spinner" aria-hidden="true"></span>
      <p>Загружаем список подопечных…</p>
    </div>

    <div v-else-if="loadError" class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ loadError }}</p>
      <button class="btn-outline" @click="fetchPatients">
        <Icon name="refresh-cw" :size="16" />
        Повторить
      </button>
    </div>

    <div v-else-if="patients.length" class="grid grid-auto">
      <article
        v-for="patient in patients"
        :key="patient.id"
        class="patient-card card card-hoverable"
      >
        <div class="patient-header">
          <div class="patient-id">
            <span class="avatar"><Icon name="user" :size="20" /></span>
            <div class="patient-main">
              <h3 class="patient-name">{{ patient.profile?.name || patient.email }}</h3>
              <span
                :class="[
                  'chip',
                  patient.profile?.attentionScore > 50 ? 'badge-danger' : 'badge-primary',
                ]"
              >
                Приоритет: {{ patient.profile?.attentionScore || 0 }}
              </span>
            </div>
          </div>
        </div>

        <div class="sentiment-heatmap" v-if="patient.diaryEntries?.length">
          <span
            v-for="(trend, i) in patient.diaryEntries"
            :key="i"
            :class="['heat-cell', trend.riskLevel]"
            :title="`${formatEntryDate(trend.date)}: ${(trend.tags ?? []).join(', ')}`"
          ></span>
        </div>
        <p v-else class="muted no-entries">Дневниковых записей пока нет.</p>

        <div class="recent-stats">
          <span class="mini-stat"><Icon name="flame" :size="15" /> {{ patient.streak }}д</span>
          <span class="mini-stat"><Icon name="star" :size="15" /> {{ patient.points }}</span>
          <span class="mini-stat"
            ><Icon name="clock" :size="15" /> {{ patient.profile?.sleepHours ?? '—' }}ч сна</span
          >
        </div>

        <button @click="viewDetails(patient)" class="btn-outline btn-block details-btn">
          <Icon name="activity" :size="16" />
          Открыть анализ
        </button>
      </article>
    </div>
    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="users" :size="32" /></span>
      <p>Пока нет подопечных, закреплённых за вами.</p>
    </div>

    <Teleport to="body">
      <div
        ref="patientDialog"
        tabindex="-1"
        aria-labelledby="patient-title"
        v-if="selectedPatient"
        class="patient-modal"
        role="dialog"
        aria-modal="true"
        @click.self="selectedPatient = null"
      >
        <div class="modal-content card">
          <button class="icon-btn close-btn" @click="selectedPatient = null" aria-label="Закрыть">
            <Icon name="x" :size="20" />
          </button>
          <div class="modal-title-row">
            <span class="avatar avatar-lg"><Icon name="user" :size="24" /></span>
            <h2 id="patient-title">{{ selectedPatient.profile?.name || selectedPatient.email }}</h2>
          </div>

          <section class="modal-section">
            <div class="section-head">
              <h3 class="section-title">Последние записи в дневнике</h3>
            </div>
            <div v-if="selectedPatient.diaryEntries?.length" class="stack">
              <div v-for="entry in selectedPatient.diaryEntries" :key="entry.id" class="entry-card">
                <div class="entry-top">
                  <span class="faint">{{ new Date(entry.date).toLocaleDateString('ru-RU') }}</span>
                  <span :class="['chip', riskBadge(entry.riskLevel)]">{{ entry.riskLevel }}</span>
                </div>
                <p>{{ entry.content }}</p>
              </div>
            </div>
            <p v-else class="muted">Записей пока нет.</p>
          </section>

          <section class="modal-section">
            <div class="section-head"><h3 class="section-title">История чатов (риски)</h3></div>
            <div v-if="selectedPatient.chatSessions?.length" class="stack">
              <div
                v-for="session in selectedPatient.chatSessions"
                :key="session.id"
                class="session-card row-between"
              >
                <span class="faint">{{ new Date(session.date).toLocaleDateString('ru-RU') }}</span>
                <span :class="['chip', riskBadge(session.riskLevel)]"
                  >Уровень риска: {{ session.riskLevel }}</span
                >
              </div>
            </div>
            <p v-else class="muted">Чат-сессий с зафиксированным риском не найдено.</p>
          </section>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useFocusScope } from '@/composables/useFocusScope';
import Icon from '@/components/Icon.vue';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DiaryEntry {
  id: string;
  date: string;
  riskLevel: string;
  content: string;
  tags: string[];
}

interface ChatSessionSummary {
  id: string;
  date: string;
  riskLevel: string;
}

interface PatientProfile {
  name?: string;
  attentionScore: number;
  sleepHours?: number;
}

interface Patient {
  id: string;
  email: string;
  streak?: number;
  points?: number;
  profile: PatientProfile;
  diaryEntries?: DiaryEntry[];
  chatSessions?: ChatSessionSummary[];
}

const patients = ref<Patient[]>([]);
const selectedPatient = ref<Patient | null>(null);
const patientDialog = ref<HTMLElement | null>(null);
useFocusScope(
  computed(() => selectedPatient.value !== null),
  patientDialog,
  () => {
    selectedPatient.value = null;
  },
  () => [...document.querySelectorAll<HTMLElement>('#app')],
);
const isLoading = ref(false);
const loadError = ref('');

const urgentCount = computed(
  () => patients.value.filter((p) => (p.profile?.attentionScore || 0) > 50).length,
);

const riskBadge = (level: string) => {
  if (level === 'high') return 'badge-danger';
  if (level === 'medium') return 'badge-warning';
  return 'badge-success';
};

const formatEntryDate = (value: string) => new Date(value).toLocaleDateString('ru-RU');

const fetchPatients = async () => {
  isLoading.value = true;
  loadError.value = '';
  try {
    const response = await axios.get(`${API_URL}/therapist/patients`);
    patients.value = Array.isArray(response.data) ? response.data : [];
  } catch (e) {
    console.error('Error fetching patients', e);
    /*
     * Silently keeping the empty list made a network failure indistinguishable
     * from "you have no patients" — the single most misleading outcome on this
     * screen, because the clinician would conclude there is nothing to follow
     * up on. Surface the failure with a retry instead.
     */
    patients.value = [];
    loadError.value = 'Не удалось загрузить список подопечных. Проверьте соединение.';
  } finally {
    isLoading.value = false;
  }
};

const viewDetails = (patient: Patient) => {
  selectedPatient.value = patient;
};

onMounted(fetchPatients);
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  max-width: 520px;
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

.patient-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  border-left: 4px solid var(--primary-color);
}

.patient-header {
  display: flex;
}
.patient-id {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}
.avatar-lg {
  width: 48px;
  height: 48px;
}

.patient-main {
  min-width: 0;
}
.patient-name {
  font-size: var(--text-base);
  margin-bottom: var(--space-2);
  word-break: break-word;
}

.sentiment-heatmap {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.heat-cell {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.heat-cell.low {
  background: var(--success-bg);
}
.heat-cell.medium {
  background: var(--warning-bg);
}
.heat-cell.high {
  background: var(--danger-bg);
}
.no-entries {
  font-size: var(--text-sm);
  margin: 0;
}

.recent-stats {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.mini-stat {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--muted-text);
}

.details-btn {
  margin-top: auto;
}

/* Modal */
.patient-modal {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-5);
}

.modal-content {
  width: 100%;
  max-width: 800px;
  max-height: calc(100dvh - var(--space-7));
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: var(--shadow-lg);
  position: relative;
}

.close-btn {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  padding-right: var(--space-7);
}
.modal-title-row h2 {
  margin: 0;
}

.modal-section {
  margin-top: var(--space-6);
}
.modal-section:first-of-type {
  margin-top: 0;
}

.entry-card,
.session-card {
  background: var(--bg-soft);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  box-shadow: none;
}
.entry-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.entry-card p {
  margin: 0;
}
.entry-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 560px) {
  .stats-row {
    grid-template-columns: 1fr;
    max-width: none;
  }
}
</style>
