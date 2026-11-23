import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
const API = import.meta.env.VITE_API_URL || '/api';

/** Serialized autosave with optimistic versions; sensitive text never enters browser storage. */
export function useServerDraft(text: Ref<string>, kind: 'diary' | 'homework', key: Ref<string>) {
  const auth = useAuthStore();
  const draftReady = ref(false);
  const draftState = ref('Загружаем черновик…');
  const draftError = ref('');
  const saving = ref(false);
  let version = 0;
  const saved = ref('');
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, Promise<boolean>>();
  const dirty = computed(() => draftReady.value && text.value !== saved.value);
  const url = () => `${API}/drafts/${kind}/${encodeURIComponent(key.value)}`;
  const pendingKey = (userId: string, endpoint: string) => JSON.stringify([userId, endpoint]);
  const reloadDraft = async () => {
    const current = ++generation;
    clearTimeout(timer);
    saving.value = false;
    draftReady.value = false;
    draftError.value = '';
    draftState.value = 'Загружаем черновик…';
    text.value = '';
    saved.value = '';
    version = 0;
    const userId = auth.user?.id;
    if (!userId || !key.value) return;
    const endpoint = url();
    const previousSave = pending.get(pendingKey(userId, endpoint));
    if (previousSave) await previousSave;
    if (disposed || current !== generation) return;
    try {
      const response = await axios.get(endpoint, { headers: { 'X-Expected-User-Id': userId } });
      if (disposed || current !== generation) return;
      text.value = typeof response.data.text === 'string' ? response.data.text : '';
      saved.value = text.value;
      version = typeof response.data.version === 'number' ? response.data.version : 0;
      draftReady.value = true;
      draftState.value = saved.value
        ? 'Черновик восстановлен'
        : 'Черновик сохраняется автоматически';
    } catch {
      if (current !== generation || disposed) return;
      draftState.value = '';
      draftError.value = 'Не удалось загрузить черновик. Повторите загрузку перед вводом текста.';
    }
  };
  const flushDraft = async (): Promise<boolean> => {
    clearTimeout(timer);
    const userId = auth.user?.id;
    if (disposed || !draftReady.value || !userId) return false;
    const current = generation;
    const endpoint = url();
    const operationKey = pendingKey(userId, endpoint);
    const previousSave = pending.get(operationKey);
    if (previousSave) {
      const result = await previousSave;
      return result && current === generation ? flushDraft() : false;
    }
    if (!dirty.value) return true;
    const snapshot = text.value;
    saving.value = true;
    draftState.value = 'Сохраняем черновик…';
    const save = (async () => {
      try {
        const response = await axios.put(
          endpoint,
          { text: snapshot, version },
          { headers: { 'X-Expected-User-Id': userId } },
        );
        if (disposed || current !== generation) return false;
        version = response.data.version;
        saved.value = snapshot;
        draftError.value = '';
        draftState.value = 'Черновик сохранён';
        return true;
      } catch (error) {
        if (current !== generation || disposed) return false;
        draftState.value = '';
        const response = axios.isAxiosError(error) ? error.response : undefined;
        if (response?.data?.code === 'SESSION_CHANGED') {
          draftError.value =
            'Аккаунт изменился в другой вкладке. Скопируйте текст и обновите страницу.';
        } else if (response?.status === 409) {
          draftError.value =
            'Черновик изменён в другой вкладке. Скопируйте свой текст перед загрузкой сохранённой версии.';
        } else {
          draftError.value =
            'Не удалось сохранить черновик. Текст остаётся в форме. Повторите сохранение.';
        }
        return false;
      } finally {
        if (current === generation) saving.value = false;
      }
    })();
    pending.set(operationKey, save);
    const result = await save;
    pending.delete(operationKey);
    if (!result || current !== generation) return false;
    return dirty.value ? flushDraft() : true;
  };
  watch(text, () => {
    if (!dirty.value) return;
    draftState.value = 'Есть несохранённые изменения';
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flushDraft();
    }, 700);
  });
  watch(
    [() => auth.user?.id, () => key.value],
    () => {
      void reloadDraft();
    },
    { immediate: true, flush: 'sync' },
  );
  const guard = async () => {
    if (!dirty.value && !saving.value) return true;
    if (await flushDraft()) return true;
    return window.confirm(
      'Черновик не сохранён на сервере. Покинуть страницу и потерять несохранённый текст?',
    );
  };
  onBeforeRouteLeave(guard);
  onBeforeRouteUpdate(async (to, from) =>
    to.params.homeworkId !== from.params.homeworkId ? guard() : true,
  );
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value || saving.value) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
    clearTimeout(timer);
    window.removeEventListener('beforeunload', beforeUnload);
  });
  return { draftReady, draftState, draftError, flushDraft, reloadDraft, saving, dirty };
}
