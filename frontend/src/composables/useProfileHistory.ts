import { onBeforeUnmount, ref, watch } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import { usePracticeApi } from '@/features/practices/api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * View-only helpers for the History tab of UserProfileView: per-card expand
 * state, text truncation, date formatting and gallery publish toggling.
 * Extracted verbatim — same endpoint and store mutation.
 */
export function useProfileHistory() {
  const userProfileStore = useUserProfileStore();
  const storeProfileRef = storeToRefs(userProfileStore).profile;

  // View-only: which truncated history cards are currently expanded.
  const expandedKeys = ref<Set<string>>(new Set());
  const isExpanded = (key: string) => expandedKeys.value.has(key);
  const toggleExpand = (key: string) => {
    const next = new Set(expandedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedKeys.value = next;
  };

  // View-only formatting helpers.
  const truncate = (text: string | undefined | null, len = 220) => {
    if (!text) return '';
    return text.length > len ? text.slice(0, len).trim() + '…' : text;
  };
  const formatDateTime = (d?: string) => (d ? new Date(d).toLocaleString('ru-RU') : '');
  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('ru-RU') : '');

  const toggleImagePublic = async (id: string | undefined, isPublic: boolean) => {
    if (!id) return;
    try {
      await axios.put(`${API_URL}/gallery/toggle-public`, { id, isPublic });
      const img = storeProfileRef.value?.imageAnalysisHistory?.find((i) => i.id === id);
      if (img) img.isPublic = isPublic;
    } catch {
      console.error('Request failed');
    }
  };

  return {
    isExpanded,
    toggleExpand,
    truncate,
    formatDateTime,
    formatDate,
    toggleImagePublic,
  };
}

type ChatSessions = Array<Array<{ text: string; sender: 'user' | 'ИИ'; timestamp?: string }>>;

export function useProfileChats(isHistoryVisible: () => boolean) {
  const { auth, capture, isCurrent, request } = usePracticeApi();
  const sessions = ref<ChatSessions>();
  const truncated = ref(false);
  const busy = ref(false);
  const error = ref('');
  let generation = 0;

  async function load() {
    const session = capture();
    if (!session.id || busy.value) return;
    const current = ++generation;
    busy.value = true;
    error.value = '';
    try {
      let history;
      try {
        history = await request<{ sessions: ChatSessions; truncated: boolean }>(
          session,
          '/profile/chat-history',
        );
      } catch (reason) {
        if (!axios.isAxiosError(reason) || reason.response?.status !== 404 || !isCurrent(session))
          throw reason;
        const legacy = await request<{
          id: string;
          chatSessions: ChatSessions;
          dataTruncated?: { chats?: boolean };
        }>(session, '/profile');
        if (legacy.id !== session.id) {
          auth.expireSession();
          void auth.restoreSession();
          return;
        }
        history = {
          sessions: legacy.chatSessions,
          truncated: Boolean(legacy.dataTruncated?.chats),
        };
      }
      if (current !== generation || !isCurrent(session)) return;
      sessions.value = Array.isArray(history.sessions) ? history.sessions : [];
      truncated.value = history.truncated;
    } catch {
      if (current === generation && isCurrent(session))
        error.value = 'Не удалось загрузить историю чатов.';
    } finally {
      if (current === generation && isCurrent(session)) busy.value = false;
    }
  }

  watch(
    () => [auth.user?.id, auth.sessionRevision],
    () => {
      generation++;
      sessions.value = undefined;
      truncated.value = false;
      busy.value = false;
      error.value = '';
      if (isHistoryVisible()) void load();
    },
    { flush: 'sync' },
  );
  watch(
    isHistoryVisible,
    (visible) => {
      if (visible && !sessions.value) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
  });
  return { sessions, truncated, busy, error, load };
}
