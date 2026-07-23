<template>
  <div class="page dashboard">
    <!-- Greeting -->
    <header class="greeting">
      <div>
        <h1 class="display greeting-title">
          {{ greeting }}{{ firstName ? ', ' + firstName : '' }}
        </h1>
        <p class="greeting-sub muted">{{ todayLabel }} · Как вы себя чувствуете сегодня?</p>
      </div>
    </header>

    <!-- First-run guide — tells people, in plain words, where everything lives -->
    <transition name="onb">
      <section v-if="showOnboarding" class="onboarding card">
        <button class="onb-close icon-btn" aria-label="Скрыть подсказку" @click="dismissOnboarding">
          <Icon name="x" :size="18" />
        </button>
        <div class="onb-head">
          <span class="medallion"><BrandLogo :size="24" /></span>
          <div>
            <h2 class="onb-title">С чего начать</h2>
            <p class="onb-sub muted">Три шага — и вы освоитесь. Все разделы всегда слева в меню.</p>
          </div>
        </div>
        <ol class="onb-steps">
          <li class="onb-step">
            <span class="onb-num">1</span>
            <div><b>Слева — меню.</b> Каждый пункт подписан: что он делает и зачем.</div>
          </li>
          <li class="onb-step">
            <span class="onb-num">2</span>
            <div><b>Ниже — быстрые действия.</b> Дневник, чат, дыхание — в один клик.</div>
          </li>
          <li class="onb-step">
            <span class="onb-num">3</span>
            <div><b>Внизу меню — помощь.</b> Кнопка поддержки доступна на любом экране.</div>
          </li>
        </ol>
      </section>
    </transition>

    <!-- Stats — gentle, non-competitive progress -->
    <section class="stats-row">
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="edit" :size="20" /></span>
        <div>
          <div class="stat-val">{{ diaryCount }}</div>
          <div class="stat-lbl">записей в дневнике</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="image" :size="20" /></span>
        <div>
          <div class="stat-val">{{ analysisCount }}</div>
          <div class="stat-lbl">анализов рисунков</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="book-open" :size="20" /></span>
        <div>
          <div class="stat-val">{{ coursesInProgress }}</div>
          <div class="stat-lbl">курсов в процессе</div>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-ic"><Icon name="sparkles" :size="20" /></span>
        <div>
          <div class="stat-val">{{ profile.points || 0 }}</div>
          <div class="stat-lbl">очков роста</div>
        </div>
      </div>
    </section>

    <div class="dash-grid">
      <div class="dash-main stack">
        <!-- Continue course -->
        <section v-if="activeCourse" class="card continue-card">
          <div class="section-head">
            <h2 class="section-title">Продолжить обучение</h2>
            <RouterLink to="/courses" class="see-all"
              >Все курсы <Icon name="chevron-right" :size="15"
            /></RouterLink>
          </div>
          <RouterLink :to="`/courses/${activeCourse.courseId}`" class="continue-inner">
            <span class="medallion"><Icon name="book-open" :size="22" /></span>
            <div class="continue-body">
              <div class="continue-name">{{ activeCourse.courseName }}</div>
              <div class="progress">
                <span :style="{ width: activeCourse.progress + '%' }"></span>
              </div>
              <div class="continue-meta muted">
                Прогресс {{ Math.round(activeCourse.progress) }}%
              </div>
            </div>
            <Icon name="arrow-right" :size="20" class="continue-arrow" />
          </RouterLink>
        </section>

        <!-- Quick actions -->
        <section>
          <div class="section-head"><h2 class="section-title">Быстрые действия</h2></div>
          <div class="actions-grid">
            <RouterLink
              v-for="a in actions"
              :key="a.to"
              :to="a.to"
              class="action-card card-hoverable"
            >
              <span class="medallion" :class="a.accent ? 'medallion-accent' : ''"
                ><Icon :name="a.icon" :size="22"
              /></span>
              <div class="action-title">{{ a.title }}</div>
              <div class="action-desc muted">{{ a.desc }}</div>
            </RouterLink>
          </div>
        </section>
      </div>

      <aside class="dash-side stack">
        <!-- Practice of the day -->
        <section class="card practice-card">
          <div class="practice-top">
            <span class="medallion medallion-accent"
              ><Icon :name="practice.icon" :size="22"
            /></span>
            <span class="chip badge-accent">Практика дня</span>
          </div>
          <h3 class="practice-title">{{ practice.title }}</h3>
          <p class="practice-text muted">{{ practice.text }}</p>
          <RouterLink :to="practice.to" class="btn-primary btn-block">{{
            practice.cta
          }}</RouterLink>
        </section>

        <!-- Recent diary -->
        <section class="card">
          <div class="section-head">
            <h3 class="section-title">Недавние записи</h3>
            <RouterLink to="/diary" class="see-all"
              >Дневник <Icon name="chevron-right" :size="15"
            /></RouterLink>
          </div>
          <div v-if="recentEntries.length" class="recent-list">
            <RouterLink v-for="e in recentEntries" :key="e.id" to="/diary" class="recent-item">
              <div class="recent-date faint">{{ formatDate(e.date) }}</div>
              <div class="recent-text">{{ truncate(e.text) }}</div>
            </RouterLink>
          </div>
          <div v-else class="recent-empty muted">
            <Icon name="edit" :size="22" />
            <span>Пока нет записей. Начните с первой мысли.</span>
            <RouterLink to="/diary" class="btn-outline btn-sm">Написать</RouterLink>
          </div>
        </section>

        <PeerSupport v-if="authStore.user?.organizationId" />

        <!-- Support -->
        <section class="card support-callout">
          <span class="medallion" style="background: var(--danger-bg); color: var(--danger-text)">
            <Icon name="heart" :size="22" />
          </span>
          <div>
            <div class="support-title">Нужна поддержка прямо сейчас?</div>
            <p class="support-text muted">Вы не одни. Здесь — контакты помощи.</p>
          </div>
          <button class="btn-outline btn-sm" @click="showEmergency = true">Показать</button>
        </section>
      </aside>
    </div>

    <EmergencyModal :show="showEmergency" @close="showEmergency = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/authStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import Icon from '@/components/Icon.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import PeerSupport from '@/components/PeerSupport.vue';
import EmergencyModal from '@/components/EmergencyModal.vue';

const authStore = useAuthStore();
const profileStore = useUserProfileStore();
const { profile } = storeToRefs(profileStore);

const showEmergency = ref(false);

// Onboarding hint — shown until the user dismisses it once.
const showOnboarding = ref(false);
onMounted(() => {
  if (authStore.isAuthenticated) authStore.fetchProfile();
  showOnboarding.value = localStorage.getItem('onboarding-dismissed') !== '1';
});
function dismissOnboarding() {
  showOnboarding.value = false;
  localStorage.setItem('onboarding-dismissed', '1');
}

const firstName = computed(() => (profile.value.name || '').trim().split(/\s+/)[0] || '');

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
});

const todayLabel = computed(() =>
  new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }),
);

const diaryCount = computed(() => profile.value.diaryEntries?.length || 0);
const analysisCount = computed(() => profile.value.imageAnalysisHistory?.length || 0);
const coursesInProgress = computed(
  () =>
    (profile.value.courseProgress || []).filter((c) => c.progress > 0 && c.progress < 100).length,
);

const activeCourse = computed(() => {
  const list = (profile.value.courseProgress || []).filter((c) => c.progress < 100);
  return (
    [...list].sort(
      (a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime(),
    )[0] || null
  );
});

const recentEntries = computed(() => (profile.value.diaryEntries || []).slice(0, 3));

const actions = [
  { to: '/diary', icon: 'edit', title: 'Дневник', desc: 'Записать мысли и чувства' },
  {
    to: '/chat',
    icon: 'message-circle',
    title: 'Чат-поддержка',
    desc: 'Поговорить с ассистентом',
    accent: true,
  },
  {
    to: '/image-analysis',
    icon: 'image',
    title: 'Анализ рисунка',
    desc: 'Понять, что стоит за образом',
  },
  {
    to: '/breathing',
    icon: 'wind',
    title: 'Дыхание',
    desc: 'Успокоиться за 3 минуты',
    accent: true,
  },
];

const practices = [
  {
    icon: 'wind',
    title: 'Дыхание «4-7-8»',
    text: 'Несколько минут спокойного дыхания помогают снизить тревогу и вернуть ясность.',
    to: '/breathing',
    cta: 'Начать практику',
  },
  {
    icon: 'edit',
    title: 'Три строчки о дне',
    text: 'Запишите три момента сегодняшнего дня. Небольшая рефлексия — большой шаг.',
    to: '/diary',
    cta: 'Открыть дневник',
  },
  {
    icon: 'palette',
    title: 'Свободный рисунок',
    text: 'Нарисуйте своё состояние без правил и получите бережный отклик.',
    to: '/image-analysis',
    cta: 'Попробовать',
  },
];
// Rotate by day of month — stable within a day, no Math.random.
const practice = computed(() => practices[new Date().getDate() % practices.length]);

function truncate(t: string, n = 90) {
  if (!t) return '';
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
</script>

<style scoped>
.greeting {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.greeting-title {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-1);
}
.greeting-sub {
  font-size: var(--text-base);
  margin: 0;
  text-transform: none;
}
.greeting-sub::first-letter {
  text-transform: uppercase;
}

/* Onboarding guide */
.onboarding {
  position: relative;
  margin-bottom: var(--space-6);
}
.onb-close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 32px;
  height: 32px;
}
.onb-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding-right: var(--space-6);
}
.onb-title {
  font-size: var(--text-lg);
  margin: 0;
}
.onb-sub {
  font-size: var(--text-sm);
  margin: 0;
}
.onb-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.onb-step {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.onb-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  font-size: var(--text-xs);
  font-weight: 700;
}
.onb-enter-active,
.onb-leave-active {
  transition:
    opacity var(--transition),
    transform var(--transition);
}
.onb-enter-from,
.onb-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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

.dash-grid {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--space-5);
  align-items: start;
}

.see-all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--muted-text);
}
.see-all:hover {
  color: var(--primary-color);
}

.continue-inner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  text-decoration: none;
  color: inherit;
}
.continue-body {
  flex: 1;
  min-width: 0;
}
.continue-name {
  font-weight: 650;
  margin-bottom: var(--space-2);
}
.continue-meta {
  font-size: var(--text-xs);
  margin-top: var(--space-2);
}
.continue-arrow {
  color: var(--faint-text);
  transition:
    transform var(--transition),
    color var(--transition);
}
.continue-inner:hover .continue-arrow {
  color: var(--primary-color);
  transform: translateX(3px);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}
.action-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  text-decoration: none;
  color: inherit;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.action-card .medallion {
  margin-bottom: var(--space-1);
}
.action-title {
  font-weight: 650;
  font-size: var(--text-base);
}
.action-desc {
  font-size: var(--text-sm);
}

.practice-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.practice-title {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.practice-text {
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.recent-list {
  display: flex;
  flex-direction: column;
}
.recent-item {
  display: block;
  padding: var(--space-3) 0;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--border-color);
}
.recent-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.recent-item:first-child {
  padding-top: 0;
}
.recent-date {
  font-size: var(--text-xs);
  margin-bottom: 2px;
}
.recent-text {
  font-size: var(--text-sm);
  line-height: 1.5;
}
.recent-item:hover .recent-text {
  color: var(--primary-color);
}
.recent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-4);
  font-size: var(--text-sm);
}

.support-callout {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.support-callout > div {
  flex: 1;
  min-width: 0;
}
.support-title {
  font-weight: 650;
  font-size: var(--text-sm);
}
.support-text {
  font-size: var(--text-xs);
  margin: 0;
}

@media (max-width: 980px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 720px) {
  .onb-steps {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
}
@media (max-width: 560px) {
  .greeting {
    flex-direction: column;
  }
  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
