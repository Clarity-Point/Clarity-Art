import { onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { usePracticeApi } from './api';
import type { PracticeDraftSummary } from './usePracticeDraft';

export function useLatestPracticeDraft(enabled: MaybeRefOrGetter<boolean> = true) {
  const { auth, capture, isCurrent, request } = usePracticeApi();
  const latest = ref<PracticeDraftSummary>();
  let generation = 0;
  async function load() {
    const session = capture();
    const current = ++generation;
    if (!session.id || !toValue(enabled)) return;
    try {
      const rows = await request<PracticeDraftSummary[]>(session, '/practices/drafts');
      if (generation === current && isCurrent(session)) latest.value = rows[0];
    } catch {
      if (generation === current && isCurrent(session)) latest.value = undefined;
    }
  }
  watch(
    () => [auth.user?.id, toValue(enabled)],
    () => {
      latest.value = undefined;
      void load();
    },
    { immediate: true, flush: 'sync' },
  );
  onMounted(() => {
    window.addEventListener('focus', load);
  });
  onBeforeUnmount(() => {
    generation++;
    window.removeEventListener('focus', load);
  });
  return latest;
}
