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
  let pending: Promise<boolean> | null = null;
  const dirty = computed(() => draftReady.value && text.value !== saved.value);
  const url = () => `${API}/drafts/${kind}/${encodeURIComponent(key.value)}`;
  const reloadDraft = async () => {
    const current = ++generation;
    clearTimeout(timer);
    draftReady.value = false;
    draftError.value = '';
    draftState.value = 'Загружаем черновик…';
    text.value = '';
    saved.value = '';
    version = 0;
    if (!auth.user?.id || !key.value) return;
    try {
      const response = await axios.get(url());
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
    if (!draftReady.value) return false;
    if (pending) {
      await pending;
      return dirty.value ? flushDraft() : !draftError.value;
    }
    if (!dirty.value) return true;
    const current = generation;
    const snapshot = text.value;
    const endpoint = url();
    saving.value = true;
    draftState.value = 'Сохраняем черновик…';
    pending = (async () => {
      try {
        const response = await axios.put(endpoint, { text: snapshot, version });
        if (disposed || current !== generation) return false;
        version = response.data.version;
        saved.value = snapshot;
        draftError.value = '';
        draftState.value = 'Черновик сохранён';
        return true;
      } catch (error) {
        if (current !== generation || disposed) return false;
        draftState.value = '';
        draftError.value =
          axios.isAxiosError(error) && error.response?.status === 409
            ? 'Черновик изменён в другой вкладке. Скопируйте свой текст перед загрузкой сохранённой версии.'
            : 'Не удалось сохранить черновик. Текст остаётся в форме. Повторите сохранение.';
        return false;
      } finally {
        saving.value = false;
        pending = null;
      }
    })();
    const result = await pending;
    if (result && dirty.value) return flushDraft();
    return result;
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
    { immediate: true },
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
