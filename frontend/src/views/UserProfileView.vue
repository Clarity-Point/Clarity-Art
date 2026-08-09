<template>
  <div class="page user-profile-view" :style="rootStyles">
    <h1 class="page-title display">Мой профиль</h1>
    <p class="page-subtitle">
      Здесь собрано всё о вашем пути: личные данные, здоровье, достижения и история занятий.
    </p>

    <!-- Profile header -->
    <section class="card profile-hero">
      <div class="hero-identity">
        <span class="profile-avatar">{{ initials }}</span>
        <div class="hero-info">
          <h2 class="hero-name">{{ storeProfileRef.name || 'Без имени' }}</h2>
          <span class="chip badge-primary">{{ categoryLabel }}</span>
        </div>
      </div>

      <div class="hero-stats">
        <div class="stat-tile">
          <span class="stat-ic"><Icon name="sparkles" :size="20" /></span>
          <div>
            <div class="stat-val">{{ storeProfileRef.points || 0 }}</div>
            <div class="stat-lbl">очков роста</div>
          </div>
        </div>
        <AiAvatar
          :points="storeProfileRef.points || 0"
          :showLabel="true"
          :mood="userProfileStore.moodTheme"
        />
      </div>
    </section>

    <!-- Tab bar -->
    <div class="tab-bar" role="tablist" aria-label="Разделы профиля">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === t.id"
        :class="['tab-btn', { active: activeTab === t.id }]"
        @click="activeTab = t.id"
      >
        <Icon :name="t.icon" :size="18" />
        <span>{{ t.label }}</span>
      </button>
    </div>

    <!-- Profile tab -->
    <section v-if="activeTab === 'profile'" class="tab-panel stack">
      <form @submit.prevent="saveProfile" class="card stack">
        <div class="section-head"><h2 class="section-title">Личная информация</h2></div>

        <div class="grid grid-2 form-grid">
          <div class="form-group">
            <label for="name">Имя</label>
            <input id="name" type="text" v-model="profile.name" placeholder="Как вас называть?" />
          </div>
          <div class="form-group">
            <label for="age">Возраст</label>
            <input
              id="age"
              type="number"
              min="0"
              v-model.number="profile.age"
              placeholder="Необязательно"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="category">Категория профиля</label>
          <select id="category" v-model="profile.category">
            <option value="general">Общий профиль</option>
            <option value="adult">Взрослый</option>
            <option value="child">Ребёнок / подросток</option>
            <option value="svo_participant">Восстановление после трудного опыта</option>
          </select>
        </div>

        <div class="form-group">
          <label for="interests">Интересы (через запятую)</label>
          <input
            id="interests"
            type="text"
            v-model="profile.interests"
            placeholder="рисование, музыка, прогулки…"
          />
        </div>

        <div class="form-group">
          <label for="goals">Цели арт-терапии</label>
          <textarea
            id="goals"
            v-model="profile.goals"
            rows="3"
            placeholder="Что вы хотите почувствовать или изменить?"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="concerns">Основные переживания</label>
          <textarea
            id="concerns"
            v-model="profile.concerns"
            rows="3"
            placeholder="Что беспокоит вас в последнее время?"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="preferredStyle">Предпочитаемый стиль работы</label>
          <input
            id="preferredStyle"
            type="text"
            v-model="profile.preferredStyle"
            placeholder="Например: мягкий и бережный темп"
          />
        </div>

        <div class="form-group">
          <label for="preferences">Предпочтения в темах/стилях</label>
          <textarea
            id="preferences"
            v-model="profile.preferences"
            rows="3"
            placeholder="Какие темы и визуальные стили вам близки?"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="additionalInfo">Дополнительная информация</label>
          <textarea
            id="additionalInfo"
            v-model="profile.additionalInfo"
            rows="3"
            placeholder="Всё остальное, что важно знать о вас"
          ></textarea>
        </div>

        <button type="submit" class="btn-primary btn-block">
          <Icon name="check" :size="18" /> Сохранить профиль
        </button>
        <p v-if="profileMessage" class="submission-feedback" role="status">
          {{ profileMessage }}
        </p>
      </form>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Анализ профиля</h2></div>
        <p class="muted">
          Получите ИИ-обзор вашего пути: настроение, ключевые темы и рекомендации на основе всей
          вашей активности.
        </p>

        <div v-if="profileAnalysisResult" class="analysis-result">
          <VueMarkdown :source="profileAnalysisResult" class="markdown-content" />
        </div>
        <div v-if="isAnalyzingProfile" class="row muted analysis-loading">
          <Icon name="sparkles" :size="16" /> Анализируем профиль…
        </div>
        <div v-if="profileAnalysisError" class="error-message">
          Ошибка анализа профиля: {{ profileAnalysisError }}
        </div>

        <button
          @click="performProfileAnalysis"
          :disabled="isAnalyzingProfile || noAnalysisData"
          class="btn-outline"
        >
          <Icon name="sparkles" :size="18" />
          {{ isAnalyzingProfile ? 'Анализируем…' : 'Выполнить всесторонний анализ' }}
        </button>
        <p v-if="noAnalysisData" class="faint">
          Недостаточно данных для анализа. Заполните информацию о себе или пройдите несколько
          активностей на сайте.
        </p>
      </section>
    </section>

    <!-- Health tab -->
    <section v-else-if="activeTab === 'health'" class="tab-panel stack">
      <section class="card stack">
        <div class="section-head">
          <h2 class="section-title">Метрики здоровья</h2>
          <button @click="loadSampleHealthData" class="btn-ghost btn-sm" :disabled="isSyncing">
            <Icon name="refresh-cw" :size="16" />
            {{ isSyncing ? 'Загрузка…' : 'Демо-данные' }}
          </button>
        </div>
        <p class="muted">
          Введите показатели с любых умных часов или фитнес-трекера — данные о сне и активности
          помогают точнее видеть связь между самочувствием и настроением.
        </p>

        <div class="grid grid-3 health-grid">
          <div class="stat-tile health-tile health-tile-editable">
            <span class="stat-ic"><Icon name="heart" :size="20" /></span>
            <div class="health-input-group">
              <label for="heartRateAvg" class="stat-lbl">BPM, средний пульс</label>
              <input
                id="heartRateAvg"
                type="number"
                step="1"
                min="0"
                v-model.number="profile.heartRateAvg"
                @change="saveHealthData"
              />
            </div>
          </div>
          <div class="stat-tile health-tile health-tile-editable">
            <span class="stat-ic"><Icon name="moon" :size="20" /></span>
            <div class="health-input-group">
              <label for="sleepHours" class="stat-lbl">Сон, часов</label>
              <input
                id="sleepHours"
                type="number"
                step="0.5"
                min="0"
                v-model.number="profile.sleepHours"
                @change="saveHealthData"
              />
            </div>
          </div>
          <div class="stat-tile health-tile health-tile-editable">
            <span class="stat-ic"><Icon name="activity" :size="20" /></span>
            <div class="health-input-group">
              <label for="stepsCount" class="stat-lbl">шагов за день</label>
              <input
                id="stepsCount"
                type="number"
                step="100"
                min="0"
                v-model.number="profile.stepsCount"
                @change="saveHealthData"
              />
            </div>
          </div>
        </div>

        <p v-if="healthMessage" class="submission-feedback" role="status">
          {{ healthMessage }}
        </p>
        <div class="health-correlation-hint" v-if="storeProfileRef.stepsCount > 0">
          <Icon name="lightbulb" :size="16" /> Показатели сохранены. Сопоставляйте их с дневником в
          разделе аналитики — приложение не делает медицинских выводов.
        </div>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Сводка о состоянии</h2></div>
        <div v-if="analyticsSummary" class="stack summary-content">
          <p><strong>Активность:</strong> {{ analyticsSummary.activity }}</p>
          <p><strong>Что уже накоплено:</strong> {{ analyticsSummary.sources.join(', ') }}</p>
          <p><strong>Следующий шаг:</strong> {{ analyticsSummary.nextStep }}</p>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="bar-chart" :size="26" /></span>
          <p>
            Данные о вашем состоянии пока не доступны. Пройдите несколько сессий или заданий, чтобы
            получить сводку.
          </p>
        </div>
      </section>
    </section>

    <!-- Achievements tab -->
    <section v-else-if="activeTab === 'achievements'" class="tab-panel">
      <div class="card">
        <AchievementsList :achievements="storeProfileRef.achievements || []" />
      </div>
    </section>

    <!-- History tab -->
    <section v-else-if="activeTab === 'history'" class="tab-panel stack">
      <div
        v-if="
          storeProfileRef.dataTruncated &&
          Object.values(storeProfileRef.dataTruncated).some(Boolean)
        "
        class="card history-limit-notice"
        role="status"
      >
        В профиле показана последняя активность. Полная история без сокращений доступна в
        JSON-архиве на вкладке «Данные и специалист».
      </div>
      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Анализ изображений</h2></div>
        <div
          v-if="
            storeProfileRef.imageAnalysisHistory && storeProfileRef.imageAnalysisHistory.length > 0
          "
          class="stack"
        >
          <div
            v-for="entry in storeProfileRef.imageAnalysisHistory"
            :key="entry.timestamp"
            class="history-entry"
          >
            <div class="row-between entry-head">
              <span class="faint entry-meta">
                {{ formatDateTime(entry.timestamp) }}
                <template v-if="entry.originalImageName">· {{ entry.originalImageName }}</template>
              </span>
              <span v-if="entry.isPublic" class="chip badge-success">В галерее</span>
            </div>
            <div class="entry-body">
              <img
                v-if="entry.imagePreviewUrl"
                :src="entry.imagePreviewUrl"
                alt="Анализируемое изображение"
                class="entry-thumb"
              />
              <div class="entry-text">
                <VueMarkdown
                  :source="
                    isExpanded('img-' + entry.timestamp)
                      ? entry.analysisText
                      : truncate(entry.analysisText)
                  "
                  class="markdown-content"
                />
                <div class="entry-actions">
                  <button
                    v-if="entry.analysisText && entry.analysisText.length > 220"
                    class="btn-ghost btn-sm"
                    @click="toggleExpand('img-' + entry.timestamp)"
                  >
                    {{ isExpanded('img-' + entry.timestamp) ? 'Свернуть' : 'Читать полностью' }}
                  </button>
                  <button
                    class="btn-outline btn-sm"
                    @click="toggleImagePublic(entry.id, !entry.isPublic)"
                  >
                    <Icon :name="entry.isPublic ? 'eye' : 'upload'" :size="14" />
                    {{ entry.isPublic ? 'Сделать приватным' : 'Опубликовать в галерее' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="image" :size="26" /></span>
          <p>
            История анализов изображений пока пуста. Проанализируйте несколько изображений, чтобы
            увидеть их здесь.
          </p>
        </div>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Успеваемость по курсам</h2></div>
        <div
          v-if="storeProfileRef.courseProgress && storeProfileRef.courseProgress.length > 0"
          class="stack"
        >
          <div
            v-for="course in storeProfileRef.courseProgress"
            :key="course.courseId"
            class="history-entry"
          >
            <div class="row-between">
              <h3 class="entry-title">{{ course.courseName }}</h3>
              <span class="faint">{{ Math.round(course.progress) }}%</span>
            </div>
            <div class="progress"><span :style="{ width: course.progress + '%' }"></span></div>
            <p class="faint entry-meta">
              Последняя активность: {{ formatDate(course.lastAccessed) }}
              <template v-if="course.completedDate"
                >· завершён {{ formatDate(course.completedDate) }}</template
              >
            </p>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="book-open" :size="26" /></span>
          <p>Вы ещё не начали ни одного курса.</p>
        </div>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Домашние задания</h2></div>
        <div
          v-if="storeProfileRef.homeworkHistory && storeProfileRef.homeworkHistory.length > 0"
          class="stack"
        >
          <div
            v-for="hw in storeProfileRef.homeworkHistory"
            :key="hw.homeworkId"
            class="history-entry"
          >
            <div class="row-between">
              <h3 class="entry-title">{{ hw.homeworkTitle }}</h3>
              <span v-if="hw.grade" class="chip badge-primary">{{ hw.grade }}</span>
            </div>
            <p class="faint entry-meta">Сдано: {{ formatDateTime(hw.submissionDate) }}</p>
            <p class="hw-content">
              {{
                isExpanded('hw-' + hw.homeworkId)
                  ? hw.submittedContent
                  : truncate(hw.submittedContent, 160)
              }}
            </p>
            <div v-if="hw.analysisText" class="hw-analysis">
              <VueMarkdown
                :source="
                  isExpanded('hw-' + hw.homeworkId)
                    ? hw.analysisText
                    : truncate(hw.analysisText, 160)
                "
                class="markdown-content"
              />
            </div>
            <button
              v-if="
                (hw.submittedContent && hw.submittedContent.length > 160) ||
                (hw.analysisText && hw.analysisText.length > 160)
              "
              class="btn-ghost btn-sm"
              @click="toggleExpand('hw-' + hw.homeworkId)"
            >
              {{ isExpanded('hw-' + hw.homeworkId) ? 'Свернуть' : 'Читать полностью' }}
            </button>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="file-text" :size="26" /></span>
          <p>Домашние задания появятся здесь после первой сдачи.</p>
        </div>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">История чатов с ИИ</h2></div>
        <div
          v-if="storeProfileRef.chatSessions && storeProfileRef.chatSessions.length > 0"
          class="stack"
        >
          <div
            v-for="(session, index) in storeProfileRef.chatSessions"
            :key="index"
            class="history-entry"
          >
            <button
              type="button"
              class="row-between session-toggle"
              @click="toggleExpand('chat-' + index)"
            >
              <span class="entry-title"
                >Сессия №{{ storeProfileRef.chatSessions.length - index }}</span
              >
              <span class="row faint">
                <span>{{ session.length }} сообщений</span>
                <Icon
                  :name="isExpanded('chat-' + index) ? 'chevron-down' : 'chevron-right'"
                  :size="16"
                />
              </span>
            </button>
            <div v-if="isExpanded('chat-' + index)" class="session-messages">
              <div
                v-for="(msg, msgIndex) in session"
                :key="msgIndex"
                :class="['message-item', msg.sender === 'user' ? 'user-msg' : 'ai-msg']"
              >
                <strong>{{ msg.sender === 'user' ? 'Вы' : 'ИИ' }}:</strong>
                <VueMarkdown :source="msg.text" class="markdown-content" />
              </div>
            </div>
            <p v-else class="faint session-preview">{{ truncate(session[0]?.text || '', 120) }}</p>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><Icon name="message-circle" :size="26" /></span>
          <p>Диалогов с ИИ пока нет.</p>
        </div>
      </section>
    </section>

    <!-- Therapist & data tab -->
    <section v-else-if="activeTab === 'therapist'" class="tab-panel stack">
      <section class="card stack">
        <div class="section-head"><h2 class="section-title">AI и обработка данных</h2></div>
        <div v-if="isAiStatusLoading" class="skeleton" style="height: 70px"></div>
        <template v-else-if="aiStatus">
          <p v-if="!aiStatus.configured" class="muted">
            AI-провайдер не настроен. Приложение использует безопасные локальные заготовки и не
            отправляет ваши данные во внешние сервисы.
          </p>
          <p v-else-if="aiStatus.processingMode === 'local'" class="muted">
            AI работает локально внутри этого развёртывания. Дневник, изображения и сообщения не
            передаются внешнему провайдеру.
          </p>
          <template v-else>
            <p class="muted">
              Для AI-функций настроен внешний провайдер. Без вашего явного согласия чат, рисунки и
              профиль не будут ему отправлены; дневник продолжит работать на локальных правилах.
            </p>
            <label class="switch-row">
              <span>Разрешить передачу данных внешнему AI-провайдеру</span>
              <input
                type="checkbox"
                :checked="aiStatus.consentGiven"
                :disabled="isAiConsentSaving"
                @change="onConsentChange"
              />
            </label>
            <p class="faint">Согласие можно отозвать в любой момент.</p>
          </template>
        </template>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Связь с терапевтом</h2></div>
        <label class="switch-row">
          <span>Поделиться данными с терапевтом</span>
          <input
            type="checkbox"
            v-model="profile.isSharedWithTherapist"
            @change="!profile.isSharedWithTherapist && saveTherapistSettings()"
          />
        </label>
        <div class="form-group" v-if="profile.isSharedWithTherapist">
          <label for="therapistId">Выберите терапевта</label>
          <select id="therapistId" v-model="profile.therapistId">
            <option value="">Не выбран</option>
            <option v-for="therapist in therapists" :key="therapist.id" :value="therapist.id">
              {{ therapist.name }}
            </option>
          </select>
        </div>
        <button
          v-if="profile.isSharedWithTherapist"
          class="btn-primary"
          :disabled="!profile.therapistId.trim()"
          @click="saveTherapistSettings"
        >
          Сохранить доступ
        </button>
        <p v-if="therapistMessage" class="submission-feedback" role="status">
          {{ therapistMessage }}
        </p>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Моя организация</h2></div>
        <div v-if="!storeProfileRef.organizationId" class="stack">
          <p class="muted">
            Вы ещё не привязаны к организации. Введите код приглашения, чтобы присоединиться.
          </p>
          <div class="row org-input-group">
            <input type="text" v-model="inviteCode" placeholder="Код приглашения" />
            <button @click="joinOrganization" class="btn-primary">Присоединиться</button>
          </div>
        </div>
        <div v-else class="stack">
          <p class="muted">
            Вы являетесь участником команды. Ваша анонимная статистика доступна администратору
            организации.
          </p>
          <RouterLink
            v-if="storeProfileRef.role === 'ORG_ADMIN'"
            to="/org-admin"
            class="btn-outline"
          >
            <Icon name="building" :size="18" /> Панель администратора организации
          </RouterLink>
          <button v-else type="button" class="btn-outline" @click="leaveOrganization">
            Выйти из организации
          </button>
        </div>
      </section>

      <section class="card stack">
        <div class="section-head"><h2 class="section-title">Экспорт данных</h2></div>
        <p class="muted">
          Вы можете выгрузить свой «Дневник наблюдений» в формате PDF со всеми результатами и
          прогрессом.
        </p>
        <button @click="downloadPDF" class="btn-accent" :disabled="isExporting">
          <Icon name="download" :size="18" />
          {{ isExporting ? 'Генерация…' : 'Скачать дневник (PDF)' }}
        </button>
      </section>

      <form class="card stack" @submit.prevent="changePassword">
        <div class="section-head"><h2 class="section-title">Безопасность аккаунта</h2></div>
        <p class="muted">Используйте уникальный пароль длиной не менее 8 символов.</p>
        <div class="form-group">
          <label for="currentPassword">Текущий пароль</label>
          <input
            id="currentPassword"
            v-model="passwordForm.currentPassword"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
        <div class="grid grid-2 form-grid">
          <div class="form-group">
            <label for="newPassword">Новый пароль</label>
            <input
              id="newPassword"
              v-model="passwordForm.newPassword"
              type="password"
              minlength="8"
              autocomplete="new-password"
              required
            />
          </div>
          <div class="form-group">
            <label for="passwordConfirmation">Повторите новый пароль</label>
            <input
              id="passwordConfirmation"
              v-model="passwordForm.confirmation"
              type="password"
              minlength="8"
              autocomplete="new-password"
              required
            />
          </div>
        </div>
        <button class="btn-outline" type="submit" :disabled="isChangingPassword">
          <Icon name="shield" :size="18" />
          {{ isChangingPassword ? 'Обновляем…' : 'Изменить пароль' }}
        </button>
      </form>

      <section class="card stack danger-zone">
        <div class="section-head"><h2 class="section-title">Данные и активные сеансы</h2></div>
        <p class="muted">
          Скачайте полный JSON-архив, завершите вход на всех устройствах или удалите аккаунт.
        </p>
        <div class="account-actions">
          <button
            class="btn-outline"
            type="button"
            :disabled="isManagingAccount"
            @click="downloadAccountData"
          >
            <Icon name="download" :size="18" /> Скачать все данные
          </button>
          <button
            class="btn-outline"
            type="button"
            :disabled="isManagingAccount"
            @click="logoutAllSessions"
          >
            <Icon name="log-out" :size="18" /> Выйти на всех устройствах
          </button>
        </div>
        <div class="form-group">
          <label for="deleteAccountPassword">Текущий пароль для удаления аккаунта</label>
          <input
            id="deleteAccountPassword"
            v-model="accountPassword"
            type="password"
            autocomplete="current-password"
          />
        </div>
        <button
          class="btn-outline danger-action"
          type="button"
          :disabled="isManagingAccount"
          @click="deleteAccount"
        >
          <Icon name="trash" :size="18" /> Удалить аккаунт и все данные
        </button>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { useAnalyticsStore } from '@/stores/analyticsStore';
import { storeToRefs } from 'pinia';
import VueMarkdown from 'vue-markdown-render';
import AiAvatar from '@/components/AiAvatar.vue';
import AchievementsList from '@/components/AchievementsList.vue';
import Icon from '@/components/Icon.vue';
import { useProfileForm } from '@/composables/useProfileForm';
import { useProfileHistory } from '@/composables/useProfileHistory';
import { useProfileActions } from '@/composables/useProfileActions';
import { useAiConsent } from '@/composables/useAiConsent';

const userProfileStore = useUserProfileStore();
const storeProfileRef = storeToRefs(userProfileStore).profile;
const analyticsStore = useAnalyticsStore();

// Editable form + health/therapist persistence.
const {
  profile,
  isSyncing,
  profileMessage,
  healthMessage,
  therapistMessage,
  therapists,
  loadSampleHealthData,
  saveHealthData,
  saveTherapistSettings,
  saveProfile,
} = useProfileForm();

// History tab helpers (expand/format/publish).
const { isExpanded, toggleExpand, truncate, formatDateTime, formatDate, toggleImagePublic } =
  useProfileHistory();

// Standalone actions (analysis, export, organization).
const {
  profileAnalysisResult,
  isAnalyzingProfile,
  profileAnalysisError,
  noAnalysisData,
  performProfileAnalysis,
  isExporting,
  downloadPDF,
  inviteCode,
  joinOrganization,
  passwordForm,
  isChangingPassword,
  changePassword,
  isManagingAccount,
  accountPassword,
  downloadAccountData,
  logoutAllSessions,
  deleteAccount,
  leaveOrganization,
} = useProfileActions();

const { aiStatus, isAiStatusLoading, isAiConsentSaving, setConsent } = useAiConsent();
const onConsentChange = (event: Event) => setConsent((event.target as HTMLInputElement).checked);

// View-only: which tab of the profile is currently shown.
const activeTab = ref<'profile' | 'health' | 'achievements' | 'history' | 'therapist'>('profile');
const tabs: Array<{ id: typeof activeTab.value; label: string; icon: string }> = [
  { id: 'profile', label: 'Профиль', icon: 'user' },
  { id: 'health', label: 'Здоровье', icon: 'activity' },
  { id: 'achievements', label: 'Достижения', icon: 'trophy' },
  { id: 'history', label: 'История', icon: 'clock' },
  { id: 'therapist', label: 'Терапевт и данные', icon: 'shield' },
];

const categoryLabels: Record<string, string> = {
  adult: 'Взрослый',
  child: 'Ребёнок / подросток',
  svo_participant: 'Восстановление после трудного опыта',
  general: 'Общий профиль',
};
const categoryLabel = computed(
  () => categoryLabels[storeProfileRef.value?.category || 'general'] || 'Общий профиль',
);

const initials = computed(() => {
  const name = (storeProfileRef.value?.name || '').trim();
  if (!name) return '·';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
});

const analyticsSummary = computed(() => {
  const diaryCount = storeProfileRef.value.diaryEntries?.length || 0;
  const imageCount = storeProfileRef.value.imageAnalysisHistory?.length || 0;
  const courseCount = storeProfileRef.value.courseProgress?.length || 0;
  if (diaryCount + imageCount + courseCount === 0) return null;
  const sources = [];
  if (diaryCount) sources.push(`${diaryCount} записей дневника`);
  if (imageCount) sources.push(`${imageCount} анализов рисунков`);
  if (courseCount) sources.push(`${courseCount} курсов`);
  return {
    activity: analyticsStore.currentStreak
      ? `серия активности — ${analyticsStore.currentStreak} дней`
      : 'первые данные уже сохранены',
    sources,
    nextStep:
      'Продолжайте в удобном темпе — выводы появятся только на основе ваших реальных данных.',
  };
});

const rootStyles = computed(() => {
  const mood = userProfileStore.moodTheme;
  return {
    // Mood is expressed through design-system status tokens so it stays legible
    // in both themes. Each accent ships with its own paired foreground.
    '--mood-accent':
      mood === 'crisis'
        ? 'var(--danger-color)'
        : mood === 'warn'
          ? 'var(--warning-bg)'
          : 'var(--primary-color)',
    '--mood-on-accent':
      mood === 'crisis'
        ? 'var(--on-primary)'
        : mood === 'warn'
          ? 'var(--warning-text)'
          : 'var(--on-primary)',
    '--mood-surface':
      mood === 'crisis'
        ? 'var(--danger-bg)'
        : mood === 'warn'
          ? 'var(--warning-bg)'
          : 'var(--bg-color)',
  };
});
</script>

<style scoped>
/* The page surface is the mood tint when one is active, and the plain app
   background otherwise. It deliberately does NOT override --bg-soft: that token
   is consumed by nested elements which must keep their own elevation. */
.user-profile-view {
  background-color: var(--mood-surface, var(--bg-color));
  transition: background-color 0.5s ease;
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.danger-zone {
  border-color: var(--danger-color);
}

.danger-action {
  color: var(--danger-text);
  border-color: var(--danger-color);
}

/* ---------- Profile hero ---------- */
.profile-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin-bottom: var(--space-6);
}

.hero-identity {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

.profile-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--mood-accent, var(--primary-color));
  color: var(--mood-on-accent, var(--on-primary));
  font-size: var(--text-xl);
  font-weight: 700;
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.hero-name {
  margin: 0;
  font-size: var(--text-xl);
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* ---------- Stat tiles (shared by hero + health) ---------- */
.stat-tile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
}

.stat-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}

.stat-val {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
}

.stat-lbl {
  font-size: var(--text-xs);
  color: var(--muted-text);
}

.health-tile-editable .health-input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.health-tile-editable .health-input-group label {
  margin: 0;
}
.health-tile-editable input {
  width: 90px;
  padding: 4px 8px;
}

/* ---------- Tab bar ---------- */
.tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  padding: var(--space-1);
  margin-bottom: var(--space-6);
  width: fit-content;
  max-width: 100%;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: none;
  background: transparent;
  color: var(--muted-text);
  border-radius: var(--radius-full);
  padding: 9px 18px;
  font-weight: 600;
  font-size: var(--text-sm);
  white-space: nowrap;
}
.tab-btn:hover:not(.active) {
  background: var(--hover-bg);
  color: var(--text-color);
}
.tab-btn.active {
  background: var(--mood-accent, var(--primary-color));
  color: var(--mood-on-accent, var(--on-primary));
  box-shadow: var(--shadow-sm);
}

.tab-panel {
  animation: tab-fade-in 220ms ease;
}

.history-limit-notice {
  color: var(--muted-text);
  border-color: var(--primary-color);
  background: var(--primary-soft);
}
@keyframes tab-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- Forms ---------- */
.form-grid {
  gap: var(--space-4);
}
.form-group {
  display: flex;
  flex-direction: column;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-color);
  cursor: pointer;
}
.switch-row input {
  width: auto;
}

/* ---------- Health ---------- */
.health-correlation-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--info-bg);
  color: var(--info-text);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

/* ---------- Analysis / error states ---------- */
.error-message {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-color);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
}

.submission-feedback {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--text-color);
  font-size: var(--text-sm);
}
.analysis-loading {
  gap: var(--space-2);
}

/* ---------- History cards ---------- */
.history-entry {
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: var(--space-4);
}

.entry-head {
  margin-bottom: var(--space-2);
}
.entry-meta {
  font-size: var(--text-xs);
}
.entry-title {
  margin: 0;
  font-size: var(--text-base);
}

.entry-body {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  flex-wrap: wrap;
}

.entry-thumb {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.entry-text {
  flex: 1;
  min-width: 200px;
}

.entry-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-2);
}

.hw-content {
  white-space: pre-wrap;
  color: var(--text-color);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-2);
}

.hw-analysis {
  margin-bottom: var(--space-2);
}

.session-toggle {
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.session-preview {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
}

.session-messages {
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.message-item {
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
}
.message-item.user-msg {
  background: var(--primary-soft);
  color: var(--text-color);
}
.message-item.ai-msg {
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

/* ---------- Organization / export ---------- */
.org-input-group {
  flex-wrap: wrap;
}
.org-input-group input {
  flex: 1;
  min-width: 200px;
}

@media (max-width: 720px) {
  .profile-hero {
    flex-direction: column;
    align-items: stretch;
  }
  .hero-stats {
    justify-content: space-between;
  }
  .entry-body {
    flex-direction: column;
  }
  .entry-thumb {
    width: 100%;
    height: auto;
    max-height: 220px;
  }
}
</style>
