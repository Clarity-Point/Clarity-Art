<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import Icon from '@/components/Icon.vue';
import PracticeImage from '@/features/practices/PracticeImage.vue';
import SaveWorkForm from '@/features/practices/SaveWorkForm.vue';
import ShareComposer from '@/features/practices/ShareComposer.vue';
import {
  captionLimit,
  newRequestId,
  practiceDate,
  practiceError,
  specialistLabel,
  usePracticeApi,
  type OutgoingShare,
  type Reflection,
  type Work,
} from '@/features/practices/api';

const { auth, capture, isCurrent, request } = usePracticeApi(true);
const works = ref<Work[]>([]);
const shares = ref<OutgoingShare[]>([]);
const selectedId = ref('');
const busy = ref(false);
const mutating = ref(false);
const sharing = ref(false);
const newWork = ref(false);
const form = ref<InstanceType<typeof SaveWorkForm>>();
const title = ref<HTMLElement>();
const heading = ref<HTMLElement>();
const shareButton = ref<HTMLButtonElement>();
const shareForm = ref<InstanceType<typeof ShareComposer>>();
const reflection = ref('');
const error = ref('');
const actionError = ref('');
const status = ref('');
const selected = computed(() => works.value.find((work) => work.id === selectedId.value));
let reflectionId: string | undefined;
let loadRevision = 0;

watch(
  () => auth.sessionRevision,
  () => {
    loadRevision++;
    busy.value = false;
    mutating.value = false;
  },
  { flush: 'sync' },
);
watch(reflection, () => {
  reflectionId = undefined;
});
watch(
  () => auth.user?.id,
  () => {
    works.value = [];
    shares.value = [];
    selectedId.value = '';
    reflection.value = '';
    reflectionId = undefined;
    sharing.value = false;
    newWork.value = false;
    error.value = '';
    actionError.value = '';
    status.value = '';
    mutating.value = false;
    void load();
  },
  { immediate: true, flush: 'sync' },
);

async function load() {
  const session = capture();
  const revision = ++loadRevision;
  if (!session.id) return;
  busy.value = true;
  error.value = '';
  try {
    const [nextWorks, nextShares] = await Promise.all([
      request<Work[]>(session, '/practices/works'),
      request<OutgoingShare[]>(session, '/practices/shares'),
    ]);
    if (revision !== loadRevision || !isCurrent(session)) return;
    works.value = nextWorks;
    shares.value = nextShares;
    if (!nextWorks.some((work) => work.id === selectedId.value))
      selectedId.value = nextWorks[0]?.id ?? '';
  } catch (reason) {
    if (revision === loadRevision && isCurrent(session))
      error.value = practiceError(reason, 'Не удалось загрузить альбом.');
  } finally {
    if (revision === loadRevision && isCurrent(session)) busy.value = false;
  }
}

function confirmLeave() {
  return (
    !(reflection.value.trim() || form.value?.dirty) ||
    window.confirm('В форме есть несохранённый текст. Покинуть альбом?')
  );
}
onBeforeRouteLeave(confirmLeave);
function toggleNewWork() {
  if (!confirmLeave()) return;
  if (!newWork.value) reflection.value = '';
  newWork.value = !newWork.value;
}
async function openComposer() {
  if (!confirmLeave()) return;
  sharing.value = true;
  newWork.value = false;
  await nextTick();
  shareForm.value?.focus();
}
async function closeComposer() {
  sharing.value = false;
  await nextTick();
  shareButton.value?.focus();
  await load();
}

function selectWork(work: Work) {
  if (busy.value || mutating.value || selectedId.value === work.id) return;
  if (
    reflection.value.trim() &&
    !window.confirm('Открыть другую работу? Новая подпись ещё не сохранена.')
  )
    return;
  reflection.value = '';
  actionError.value = '';
  status.value = '';
  selectedId.value = work.id;
}
async function workSaved(work: Work) {
  works.value = [work, ...works.value.filter((item) => item.id !== work.id)];
  selectedId.value = work.id;
  reflection.value = '';
  newWork.value = false;
  status.value = 'Работа сохранена.';
  await nextTick();
  title.value?.focus();
}

async function addReflection() {
  if (!selected.value || !reflection.value.trim() || busy.value || mutating.value) return;
  const session = capture();
  const id = selected.value.id;
  reflectionId ??= newRequestId();
  mutating.value = true;
  actionError.value = '';
  try {
    const saved = await request<Reflection>(session, `/practices/works/${id}/reflections`, {
      method: 'POST',
      data: { id: reflectionId, content: reflection.value },
    });
    const work = works.value.find((item) => item.id === id);
    if (work && !work.reflections.some((item) => item.id === saved.id))
      work.reflections.push(saved);
    reflection.value = '';
    status.value = 'Новая подпись добавлена.';
  } catch (reason) {
    if (isCurrent(session))
      actionError.value = practiceError(reason, 'Не удалось сохранить подпись.');
  } finally {
    if (isCurrent(session)) mutating.value = false;
  }
}

async function deleteWork() {
  if (!selected.value || busy.value || mutating.value) return;
  if (!window.confirm('Удалить работу и её подписи? Она исчезнет и из отправленных подборок.'))
    return;
  const session = capture();
  const id = selected.value.id;
  mutating.value = true;
  actionError.value = '';
  try {
    await request(session, `/practices/works/${id}`, { method: 'DELETE' });
    works.value = works.value.filter((work) => work.id !== id);
    selectedId.value = works.value[0]?.id ?? '';
    reflection.value = '';
    status.value = 'Работа удалена.';
    await load();
  } catch (reason) {
    if (isCurrent(session)) actionError.value = practiceError(reason, 'Не удалось удалить работу.');
  } finally {
    if (isCurrent(session)) mutating.value = false;
  }
}

async function revoke(share: OutgoingShare) {
  if (
    busy.value ||
    mutating.value ||
    !window.confirm('Отозвать доступ специалиста к этой подборке?')
  )
    return;
  const session = capture();
  mutating.value = true;
  actionError.value = '';
  try {
    await request(session, `/practices/shares/${share.id}`, { method: 'DELETE' });
    shares.value = shares.value.filter((item) => item.id !== share.id);
    status.value = 'Доступ к подборке отозван.';
  } catch (reason) {
    if (isCurrent(session))
      actionError.value = practiceError(reason, 'Не удалось отозвать доступ.');
  } finally {
    if (isCurrent(session)) mutating.value = false;
  }
}

async function updateRecommendation(share: OutgoingShare, disable: boolean) {
  if (busy.value || mutating.value) return;
  const session = capture();
  const operation = disable ? 'recommendation-permission' : 'recommendation/dismissal';
  mutating.value = true;
  actionError.value = '';
  try {
    await request(session, `/practices/shares/${share.id}/${operation}`, {
      method: 'PUT',
      data: disable ? { allowed: false } : undefined,
    });
    share.recommendedPracticeId = null;
    if (disable) share.allowRecommendation = false;
    status.value = disable ? 'Рекомендации для подборки отключены.' : 'Рекомендация скрыта.';
  } catch (reason) {
    if (isCurrent(session))
      actionError.value = practiceError(reason, 'Не удалось обновить рекомендацию.');
  } finally {
    if (isCurrent(session)) mutating.value = false;
  }
}

async function shared() {
  sharing.value = false;
  status.value = 'Специалист получил доступ к подборке.';
  await nextTick();
  heading.value?.focus();
  await load();
}
</script>

<template>
  <div class="page album-page">
    <header class="page-head album-head">
      <div>
        <RouterLink class="back-link" to="/practices"
          ><Icon name="arrow-left" :size="17" /> Практики</RouterLink
        >
        <h1 ref="heading" class="page-title display" tabindex="-1">Мой альбом</h1>
        <p class="page-subtitle">
          Работы и подписи к ним видите вы. Доступ можно открыть к выбранной подборке.
        </p>
      </div>
      <div class="album-actions" v-if="!sharing">
        <button
          class="btn-primary"
          type="button"
          :aria-expanded="newWork"
          :disabled="busy || mutating"
          @click="toggleNewWork"
        >
          Добавить работу
        </button>
        <button
          v-if="works.length"
          ref="shareButton"
          class="btn-outline"
          type="button"
          :disabled="busy || mutating"
          @click="openComposer"
        >
          Собрать подборку
        </button>
      </div>
    </header>
    <p v-if="status" role="status" class="album-status">{{ status }}</p>
    <p v-if="actionError" role="alert" class="album-error">{{ actionError }}</p>
    <p v-if="error" role="alert" class="album-error">
      {{ error }}
      <button class="btn-outline" type="button" :disabled="newWork || mutating" @click="load">
        Повторить
      </button>
    </p>
    <p v-else-if="busy && !works.length" role="status" class="muted">Загружаем альбом…</p>

    <ShareComposer
      v-if="sharing"
      ref="shareForm"
      :works="works"
      @shared="shared"
      @close="closeComposer"
    />
    <template v-else>
      <div v-if="newWork" class="new-work">
        <SaveWorkForm ref="form" @saved="workSaved" />
      </div>
      <p v-if="!busy && !error && !works.length && !newWork" class="empty-album">
        Здесь появятся ваши рисунки и заметки. Можно добавить первую работу или начать с короткой
        практики.
      </p>
      <div v-if="works.length" class="album-layout">
        <section aria-labelledby="album-list-title">
          <h2 id="album-list-title">Работы</h2>
          <ul class="album-list">
            <li v-for="work in works" :key="work.id">
              <button
                type="button"
                :aria-pressed="selectedId === work.id"
                @click="selectWork(work)"
              >
                <Icon :name="work.hasImage ? 'image' : 'edit'" :size="19" />
                <span
                  ><strong>{{ work.title }}</strong
                  ><time :datetime="work.createdAt">{{ practiceDate(work.createdAt) }}</time></span
                >
              </button>
            </li>
          </ul>
        </section>
        <article v-if="selected" class="album-work" aria-labelledby="album-work-title">
          <h2 id="album-work-title" ref="title" tabindex="-1">{{ selected.title }}</h2>
          <PracticeImage
            v-if="selected.hasImage"
            :path="`/practices/works/${selected.id}/image`"
            :title="selected.title"
            download
          />
          <div class="reflections">
            <p v-if="selected.note" class="album-caption">
              <time :datetime="selected.createdAt">{{ practiceDate(selected.createdAt) }}</time>
              {{ selected.note }}
            </p>
            <p v-for="note in selected.reflections" :key="note.id" class="album-caption">
              <time :datetime="note.createdAt">{{ practiceDate(note.createdAt) }}</time>
              {{ note.content }}
            </p>
          </div>
          <form v-if="!newWork" class="stack reflection-form" @submit.prevent="addReflection">
            <label for="album-reflection">Новая подпись</label>
            <textarea
              id="album-reflection"
              v-model="reflection"
              rows="3"
              required
              :maxlength="captionLimit"
              :disabled="busy || mutating"
            />
            <button class="btn-outline" :disabled="busy || mutating">Добавить подпись</button>
          </form>
          <button
            v-if="!newWork"
            type="button"
            class="btn-outline delete-work"
            :disabled="busy || mutating"
            @click="deleteWork"
          >
            Удалить работу
          </button>
        </article>
      </div>

      <section v-if="shares.length" class="outgoing" aria-labelledby="outgoing-title">
        <h2 id="outgoing-title">Отправленные подборки</h2>
        <ul class="outgoing-list">
          <li v-for="share in shares" :key="share.id">
            <div>
              <strong>{{
                specialistLabel({ id: share.therapistId, name: share.therapistName })
              }}</strong>
              <p>{{ share.items.map((item) => item.title).join(', ') }}</p>
              <time :datetime="share.createdAt">{{ practiceDate(share.createdAt) }}</time>
              <p v-if="share.acknowledgedAt">Специалист отметил подборку как просмотренную.</p>
              <div v-if="share.recommendedPracticeId" class="album-actions">
                <RouterLink
                  class="btn-outline"
                  :to="{ name: 'practices', params: { practiceId: share.recommendedPracticeId } }"
                >
                  Открыть предложенную практику
                </RouterLink>
                <button
                  type="button"
                  class="btn-outline"
                  :disabled="busy || mutating"
                  @click="updateRecommendation(share, false)"
                >
                  Скрыть рекомендацию
                </button>
              </div>
              <button
                v-if="share.allowRecommendation"
                type="button"
                class="btn-outline"
                :disabled="busy || mutating"
                @click="updateRecommendation(share, true)"
              >
                Отключить рекомендации
              </button>
            </div>
            <button
              class="btn-outline"
              type="button"
              :disabled="busy || mutating || newWork"
              @click="revoke(share)"
            >
              Отозвать доступ
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.album-head,
.album-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--space-3);
}
.album-head {
  justify-content: space-between;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-end: var(--space-3);
}
.album-layout {
  display: grid;
  grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
  gap: var(--space-5);
  align-items: start;
}
.album-list,
.outgoing-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.album-list button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 3rem;
  padding: var(--space-3);
  border: 0;
  border-block-start: 1px solid var(--border-color);
  text-align: start;
  color: var(--text-color);
  background: transparent;
  overflow-wrap: anywhere;
}
.album-list button:hover,
.album-list [aria-pressed='true'] {
  background: var(--bg-soft);
}
.album-list button svg {
  flex: none;
}
.album-list time,
.outgoing-list time,
.album-caption time {
  display: block;
  font-size: var(--text-sm);
  color: var(--muted-text);
}
.album-work,
.new-work {
  padding: clamp(1rem, 3vw, 2rem);
  border-radius: var(--radius);
  background: var(--card-bg);
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.new-work {
  margin-block-end: var(--space-5);
  max-inline-size: 46rem;
}
.album-caption {
  white-space: pre-wrap;
  margin: 0;
  padding-block: var(--space-3);
  border-block-end: 1px solid var(--border-color);
}
.album-caption time {
  margin-block-end: var(--space-1);
}
.reflection-form,
.delete-work {
  margin-block-start: var(--space-4);
}
.reflection-form button {
  align-self: start;
}
.delete-work,
.album-error {
  color: var(--danger-text);
}
.outgoing {
  margin-block-start: var(--space-7);
}
.outgoing-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: start;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-block-start: 1px solid var(--border-color);
  overflow-wrap: anywhere;
}
.outgoing-list p {
  margin: 0;
}
.album-status,
.empty-album {
  max-inline-size: 58ch;
}
@media (max-width: 720px) {
  .album-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
