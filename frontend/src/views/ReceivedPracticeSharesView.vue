<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import Icon from '@/components/Icon.vue';
import PracticeImage from '@/features/practices/PracticeImage.vue';
import {
  getCatalog,
  practiceDate,
  practiceError,
  usePracticeApi,
  type Catalog,
  type IncomingShare,
  type IncomingShareDetails,
} from '@/features/practices/api';

const router = useRouter();
const { auth, capture, isCurrent, request } = usePracticeApi();
const shares = ref<IncomingShare[]>([]);
const cursor = ref<string | null>(null);
const open = ref('');
const details = ref<IncomingShareDetails>();
const error = ref('');
const detailsError = ref('');
const actionError = ref('');
const posting = ref(false);
const selectedPractice = ref('');
const catalog = ref<Catalog>();

const busy = ref(false);
let generation = 0;
let detailGeneration = 0;

function closeDetails() {
  detailGeneration++;
  open.value = '';
  details.value = undefined;
  detailsError.value = '';
  actionError.value = '';
  selectedPractice.value = '';
}

function restoreIfForbidden(reason: unknown) {
  if (!axios.isAxiosError(reason) || reason.response?.status !== 403) return false;
  auth.expireSession();
  void auth.restoreSession();
  return true;
}

async function readShare(id: string) {
  const session = capture();
  if (!session.id) return;
  const revision = ++detailGeneration;
  if (open.value !== id) {
    selectedPractice.value = '';
    actionError.value = '';
  }
  open.value = id;
  details.value = undefined;
  detailsError.value = '';
  try {
    const response = await request<IncomingShareDetails>(
      session,
      `/therapist/practice-shares/${id}`,
    );
    if (revision === detailGeneration && isCurrent(session)) {
      details.value = response;
      if (response.allowRecommendation && !catalog.value) await fetchCatalog();
    }
  } catch (reason) {
    if (revision !== detailGeneration || !isCurrent(session) || restoreIfForbidden(reason)) return;
    if (axios.isAxiosError(reason) && reason.response?.status === 404) {
      closeDetails();
      shares.value = shares.value.filter((share) => share.id !== id);
      error.value = 'Доступ к подборке закрыт.';
    } else {
      detailsError.value = practiceError(reason, 'Не удалось открыть подборку.');
    }
  }
}

async function fetchCatalog() {
  try {
    catalog.value = await getCatalog();
  } catch {
    actionError.value = 'Не удалось загрузить каталог практик.';
  }
}
async function sendFeedback(id: string, recommend: boolean) {
  if (posting.value || id !== open.value) return;
  const session = capture();
  posting.value = true;
  actionError.value = '';
  try {
    if (recommend) {
      const { practiceId } = await request<{ practiceId: string }>(
        session,
        `/therapist/practice-shares/${id}/recommendation`,
        { method: 'PUT', data: { practiceId: selectedPractice.value } },
      );
      if (open.value === id && details.value) details.value.recommendedPracticeId = practiceId;
    } else {
      const { acknowledgedAt } = await request<{ acknowledgedAt: string }>(
        session,
        `/therapist/practice-shares/${id}/acknowledgement`,
        { method: 'PUT' },
      );
      if (open.value === id && details.value) details.value.acknowledgedAt = acknowledgedAt;
      const summary = shares.value.find((item) => item.id === id);
      if (summary) summary.acknowledgedAt = acknowledgedAt;
    }
  } catch (reason) {
    if (!isCurrent(session) || open.value !== id || restoreIfForbidden(reason)) return;
    if (axios.isAxiosError(reason) && reason.response?.status === 404) await readShare(id);
    if (open.value === id)
      actionError.value = practiceError(reason, 'Не удалось обновить подборку.');
  } finally {
    posting.value = false;
  }
}
function toggleShare(id: string) {
  error.value = '';
  if (open.value === id) closeDetails();
  else void readShare(id);
}

async function load(append = false) {
  const session = capture();
  if (!session.id || busy.value) return;
  const revision = ++generation;
  busy.value = true;
  error.value = '';
  if (!append) closeDetails();
  try {
    const page = await request<{ items: IncomingShare[]; nextCursor: string | null }>(
      session,
      '/therapist/practice-shares',
      { params: { cursor: append ? cursor.value : undefined } },
    );
    if (revision !== generation || !isCurrent(session)) return;
    const previous = append ? shares.value : [];
    const existing = new Set(previous.map((share) => share.id));
    shares.value = [...previous, ...page.items.filter((share) => !existing.has(share.id))];
    cursor.value = page.nextCursor;
    if (open.value && !shares.value.some((share) => share.id === open.value)) closeDetails();
  } catch (reason) {
    if (revision === generation && isCurrent(session) && !restoreIfForbidden(reason)) {
      error.value = practiceError(reason, 'Не удалось загрузить подборки. Повторите попытку.');
    }
  } finally {
    if (revision === generation && isCurrent(session)) busy.value = false;
  }
}

watch(
  () => [auth.user?.id, auth.user?.role, auth.sessionRevision],
  () => {
    generation++;
    busy.value = false;
    shares.value = [];
    closeDetails();
    cursor.value = null;
    error.value = '';
    if (auth.user?.role === 'THERAPIST') void load();
    else if (auth.user?.id) void router.replace({ name: 'main' });
  },
  { immediate: true, flush: 'sync' },
);

function refresh() {
  void load();
}
function revalidate() {
  if (open.value) {
    void readShare(open.value);
    return;
  }
  const session = capture();
  if (session.id && auth.user?.role === 'THERAPIST')
    void request(session, '/therapist/practice-shares/session').catch((reason) => {
      if (isCurrent(session)) restoreIfForbidden(reason);
    });
}
onMounted(() => window.addEventListener('focus', revalidate));
onBeforeUnmount(() => {
  generation++;
  detailGeneration++;
  window.removeEventListener('focus', revalidate);
});
</script>

<template>
  <div class="page incoming-page">
    <header class="page-head incoming-head">
      <div>
        <RouterLink class="back-link" to="/therapist"
          ><Icon name="arrow-left" :size="17" /> Кабинет специалиста</RouterLink
        >
        <h1 class="page-title display">Подборки к встрече</h1>
        <p v-if="auth.user?.role === 'THERAPIST'" class="page-subtitle">
          Код получателя — {{ auth.user?.id?.slice(-8) }}. Сообщите его участнику, чтобы он мог
          сверить выбор.
        </p>
      </div>
      <button
        v-if="auth.user?.role === 'THERAPIST'"
        type="button"
        class="btn-outline"
        :disabled="busy"
        @click="refresh"
      >
        Обновить подборки
      </button>
    </header>
    <p v-if="error" class="incoming-error" role="alert">{{ error }}</p>
    <p v-else-if="busy && !shares.length" class="muted" role="status">Загружаем подборки…</p>
    <p v-else-if="!shares.length" class="muted">
      Здесь появятся работы, которыми участники поделятся с вами.
    </p>
    <section v-for="share in shares" :key="share.id" class="incoming-share">
      <button
        type="button"
        :aria-expanded="open === share.id"
        :aria-controls="`share-${share.id}`"
        @click="toggleShare(share.id)"
      >
        <span
          ><strong>{{ share.ownerName }}</strong
          ><span v-if="share.acknowledgedAt" class="muted"> · Просмотрено</span
          ><time :datetime="share.createdAt">{{ practiceDate(share.createdAt) }}</time></span
        >
        <span
          >{{ share.workCount }}
          {{ share.workCount === 1 ? 'работа' : share.workCount < 5 ? 'работы' : 'работ' }}</span
        >
        <Icon name="chevron-down" :size="18" />
      </button>
      <div :id="`share-${share.id}`" v-show="open === share.id">
        <template v-if="open === share.id">
          <p v-if="detailsError" class="incoming-error" role="alert">
            {{ detailsError }}
            <button type="button" class="btn-outline" @click="readShare(share.id)">
              Повторить
            </button>
          </p>
          <p v-else-if="!details" class="muted" role="status">Открываем подборку…</p>
          <div v-if="details" class="feedback-actions">
            <p v-if="details.acknowledgedAt" role="status">Подборка отмечена как просмотренная.</p>
            <button
              v-else
              class="btn-outline"
              type="button"
              :disabled="posting"
              @click="sendFeedback(share.id, false)"
            >
              Отметить как просмотренную
            </button>
            <p v-if="details.recommendedPracticeId" role="status">Практика предложена.</p>
            <form
              v-else-if="details.allowRecommendation && catalog"
              class="stack"
              @submit.prevent="sendFeedback(share.id, true)"
            >
              <label :for="`recommend-${share.id}`">Практика к следующей встрече</label>
              <select
                :id="`recommend-${share.id}`"
                v-model="selectedPractice"
                required
                :disabled="posting"
              >
                <option value="" disabled>Выберите практику</option>
                <option
                  v-for="practice in catalog.practices"
                  :key="practice.id"
                  :value="practice.id"
                >
                  {{ practice.title }}
                </option>
              </select>
              <button class="btn-outline" :disabled="posting || !selectedPractice">
                Предложить практику
              </button>
            </form>
            <button
              v-else-if="details.allowRecommendation && actionError"
              class="btn-outline"
              type="button"
              @click="fetchCatalog"
            >
              Загрузить каталог снова
            </button>
            <p v-if="actionError" role="alert" class="incoming-error">{{ actionError }}</p>
          </div>
          <article v-for="item in details?.items" :key="item.workId">
            <h2>{{ item.title }}</h2>
            <PracticeImage
              v-if="item.includesImage"
              :path="`/therapist/practice-shares/${share.id}/works/${item.workId}/image`"
              :title="item.title"
            />
            <p v-if="item.note" class="shared-caption">{{ item.note }}</p>
            <p v-for="(note, index) in item.reflections" :key="index" class="shared-caption">
              <time :datetime="note.createdAt">{{ practiceDate(note.createdAt) }}</time>
              {{ note.content }}
            </p>
          </article>
        </template>
      </div>
    </section>
    <button
      v-if="cursor"
      type="button"
      class="btn-outline load-more"
      :disabled="busy"
      @click="load(true)"
    >
      Загрузить ещё
    </button>
  </div>
</template>

<style scoped>
.incoming-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: start;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-end: var(--space-3);
}
.incoming-share {
  border-block-start: 1px solid var(--border-color);
  overflow-wrap: anywhere;
}
.incoming-share > button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  width: 100%;
  min-height: 3rem;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  color: var(--text-color);
  background: transparent;
  border: 0;
  text-align: start;
}
.incoming-share > button[aria-expanded='true'] svg {
  transform: rotate(180deg);
}
.incoming-share > button:hover {
  background: var(--bg-soft);
}
.incoming-share article {
  padding: var(--space-4);
  border-block-start: 1px solid var(--border-color);
}
.incoming-share time {
  display: block;
  font-size: var(--text-sm);
  color: var(--muted-text);
}
.feedback-actions {
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}
.incoming-error {
  color: var(--danger-text);
}
.shared-caption {
  white-space: pre-wrap;
  margin-block: var(--space-3);
}
.load-more {
  margin-block-start: var(--space-4);
}
</style>
