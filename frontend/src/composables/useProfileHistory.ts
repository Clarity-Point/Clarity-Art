import { ref } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';

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
    } catch (e) {
      console.error(e);
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
