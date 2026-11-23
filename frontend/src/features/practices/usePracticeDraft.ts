import { computed, onBeforeUnmount, onMounted, shallowRef, ref } from 'vue';
import axios from 'axios';
import { newRequestId, practiceError, usePracticeApi, type DrawingFile, type Work } from './api';

export interface PracticeDraftSummary {
  practiceId: string;
  updatedAt: string;
}

interface Snapshot {
  title: string;
  note: string;
  mode: 'paper' | 'canvas';
  attachmentKind: 'canvas' | 'photo' | null;
  image: DrawingFile | null;
}

interface SavedDraft {
  version: number;
  mutationId: string | null;
  snapshot: Snapshot;
}

export function usePracticeDraft(
  practiceId: string,
  defaultTitle: string,
  restoreCanvas: (image: DrawingFile | null, signal: AbortSignal) => Promise<void>,
  readCanvas: () => DrawingFile | null | undefined,
) {
  const { capture, isCurrent, request } = usePracticeApi();
  const blank = (): Snapshot => ({
    title: defaultTitle,
    note: '',
    mode: 'paper',
    attachmentKind: null,
    image: null,
  });
  const snapshot = shallowRef(blank());
  const ready = ref(false);
  const syncing = ref(false);
  const committed = ref(false);
  const finalizing = ref(false);
  const error = ref('');
  const attachmentError = ref('');
  const conflict = ref(false);
  const retryUntil = ref(0);
  const revision = ref(0);
  const persisted = ref(0);
  const finalAttempt = shallowRef<{ version: number; id: string }>();
  const dirty = computed(() => revision.value !== persisted.value);
  const op = new AbortController();
  const path = `/practices/drafts/${practiceId}`;
  let version = 0;
  let lastWrite = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<boolean> | undefined;
  let attempt:
    | { version: number; mutationId: string; snapshot: Snapshot | null; revision: number }
    | undefined;

  function meaningful(value: Snapshot) {
    return Boolean(
      value.attachmentKind || value.note.trim() || value.title.trim() !== defaultTitle,
    );
  }
  async function load() {
    const session = capture();
    clearTimeout(timer);
    ready.value = false;
    error.value = '';
    try {
      const draft = await request<SavedDraft>(session, path, { signal: op.signal });
      if (!isCurrent(session) || op.signal.aborted) return;
      const data = { ...draft.snapshot, title: draft.snapshot.title || defaultTitle };
      let imageError = '';
      try {
        await restoreCanvas(data.attachmentKind === 'canvas' ? data.image : null, op.signal);
      } catch {
        imageError =
          'Холст не удалось восстановить. Подпись доступна, рисунок можно заменить или удалить вместе с черновиком.';
        await restoreCanvas(null, op.signal);
      }
      if (!isCurrent(session) || op.signal.aborted) return;
      snapshot.value = data;
      version = draft.version;
      revision.value = persisted.value = 0;
      committed.value = meaningful(data);
      conflict.value = false;
      attempt = undefined;
      retryUntil.value = 0;
      ready.value = true;
      attachmentError.value = imageError;
    } catch (reason) {
      if (isCurrent(session) && !op.signal.aborted)
        error.value = practiceError(reason, 'Не удалось открыть черновик.');
    }
  }
  function schedule(delay = Math.max(700, lastWrite + 20_000 - Date.now())) {
    clearTimeout(timer);
    if (ready.value && dirty.value && !conflict.value && !finalizing.value && !op.signal.aborted)
      timer = setTimeout(() => void flush(), Math.max(delay, retryUntil.value - Date.now() + 100));
  }
  function edit(patch: Partial<Snapshot>) {
    const data = { ...snapshot.value, ...patch };
    const changed = meaningful(snapshot.value) || meaningful(data);
    snapshot.value = data;
    if (patch.image !== undefined) attachmentError.value = '';
    if (changed) {
      revision.value++;
      schedule();
    }
  }
  async function put() {
    const session = capture();
    if (!attempt && snapshot.value.attachmentKind === 'canvas' && !snapshot.value.image) {
      try {
        const drawing = readCanvas();
        if (drawing === undefined) {
          schedule(700);
          return false;
        }
        if (!drawing) throw new Error('Canvas snapshot is unavailable');
        snapshot.value = { ...snapshot.value, image: drawing };
      } catch {
        error.value = 'Не удалось подготовить рисунок для сохранения. Повторите попытку.';
        return false;
      }
    }
    attempt ??= {
      version,
      mutationId: newRequestId(),
      snapshot: meaningful(snapshot.value) ? snapshot.value : null,
      revision: revision.value,
    };
    const payload = attempt;
    syncing.value = true;
    lastWrite = Date.now();
    error.value = '';
    function confirm(nextVersion: number) {
      version = nextVersion;
      persisted.value = payload.revision;
      committed.value = Boolean(payload.snapshot);
      attempt = undefined;
    }
    try {
      const response = await request<{ version: number }>(session, path, {
        method: 'PUT',
        data: payload,
        signal: op.signal,
      });
      if (!isCurrent(session) || op.signal.aborted) return false;
      confirm(response.version);
      return true;
    } catch (reason) {
      if (!isCurrent(session) || op.signal.aborted) return false;
      if (axios.isAxiosError(reason) && reason.response?.data?.code === 'DRAFT_CONFLICT') {
        try {
          const current = await request<SavedDraft>(session, path, { signal: op.signal });
          if (!isCurrent(session) || op.signal.aborted) return false;
          if (
            current.version === payload.version + 1 &&
            current.mutationId === payload.mutationId
          ) {
            confirm(current.version);
            return true;
          }
          conflict.value = true;
        } catch {
          if (!isCurrent(session) || op.signal.aborted) return false;
        }
      }
      const status = axios.isAxiosError(reason) ? reason.response?.status : undefined;
      if (axios.isAxiosError(reason) && status === 429) {
        const given = Number(reason.response?.headers['retry-after']);
        const seconds = Number.isFinite(given) && given > 0 ? Math.ceil(given) : 60;
        retryUntil.value = Date.now() + seconds * 1000;
        error.value = `Черновик ждёт сохранения. Повторим через ${seconds} с.`;
        schedule(seconds * 1000 + 100);
      } else {
        if (status === 400 || status === 413) attempt = undefined;
        error.value = conflict.value
          ? 'Черновик изменился в другой вкладке. Скачайте свой рисунок или скопируйте подпись перед загрузкой версии с сервера.'
          : practiceError(reason, 'Не удалось сохранить черновик.');
      }
      return false;
    } finally {
      syncing.value = false;
    }
  }
  async function flush() {
    if (!ready.value || conflict.value || Date.now() < retryUntil.value || op.signal.aborted)
      return false;
    clearTimeout(timer);
    if (writing) {
      if (!(await writing)) return false;
    }
    if (!dirty.value) return true;
    writing ??= put().finally(() => {
      writing = undefined;
    });
    const result = await writing;
    if (result && dirty.value) schedule();
    return result;
  }
  async function finish() {
    if (finalizing.value || !ready.value || conflict.value || attachmentError.value) return;
    finalizing.value = true;
    const session = capture();
    try {
      if (!finalAttempt.value) {
        while (dirty.value) {
          if (!(await flush())) return;
        }
        finalAttempt.value = { version, id: newRequestId() };
      }
      const work = await request<Work>(session, `${path}/finalize`, {
        method: 'POST',
        data: finalAttempt.value,
        signal: op.signal,
      });
      if (!isCurrent(session) || op.signal.aborted) return;
      finalAttempt.value = undefined;
      await load();
      return work;
    } catch (reason) {
      if (isCurrent(session) && !op.signal.aborted) {
        const status = axios.isAxiosError(reason) ? reason.response?.status : undefined;
        if (status && status < 500 && status !== 429) finalAttempt.value = undefined;
        if (axios.isAxiosError(reason) && reason.response?.data?.code === 'DRAFT_CONFLICT')
          conflict.value = true;
        error.value = practiceError(
          reason,
          'Не удалось подтвердить сохранение работы. Повторите попытку.',
        );
      }
    } finally {
      finalizing.value = false;
      if (dirty.value && Date.now() < retryUntil.value)
        schedule(retryUntil.value - Date.now() + 100);
    }
  }
  async function discard() {
    if (!ready.value || finalAttempt.value || finalizing.value) return;
    await restoreCanvas(null, op.signal);
    if (op.signal.aborted) return;
    snapshot.value = blank();
    attachmentError.value = '';
    revision.value++;
    await flush();
  }
  onMounted(load);
  onBeforeUnmount(() => {
    clearTimeout(timer);
    op.abort();
  });
  return {
    snapshot,
    ready,
    syncing,
    committed,
    finalizing,
    dirty,
    error,
    attachmentError,
    conflict,
    finalAttempt,
    edit,
    flush,
    finish,
    discard,
    load,
  };
}
