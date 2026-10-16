import { ref, computed } from 'vue';
import { useUserProfileStore, type DiaryEntry } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';

/**
 * Diary entry CRUD + composer state for DiaryView: create, inline edit,
 * delete (with confirm) and the sorted list. Extracted verbatim — same store
 * mutations, same confirm dialog, same ordering.
 */
export function useDiaryEntries() {
  const userProfileStore = useUserProfileStore();
  const { profile } = storeToRefs(userProfileStore);

  const diaryEntries = computed(() => profile.value.diaryEntries || []);
  const newEntryText = ref('');
  const entryError = ref('');
  const isSavingEntry = ref(false);
  const composerTextarea = ref<HTMLTextAreaElement | null>(null);

  const focusComposer = () => {
    composerTextarea.value?.focus();
    composerTextarea.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // --- Editing State & Logic ---
  const editingEntryId = ref<string | null>(null);
  const currentEditText = ref<string>('');

  const startEdit = (entry: DiaryEntry) => {
    editingEntryId.value = entry.id;
    currentEditText.value = entry.text;
    // A banner describing a previous failed save must not stay on screen while
    // the user is typing the retry.
    entryError.value = '';
  };

  const saveEdit = async () => {
    if (editingEntryId.value && currentEditText.value.trim() !== '') {
      const saved = await userProfileStore.updateDiaryEntry(editingEntryId.value, {
        text: currentEditText.value.trim(),
      });
      if (!saved) {
        entryError.value = 'Не удалось обновить запись. Изменения оставлены в редакторе.';
        return;
      }
    }
    entryError.value = '';
    cancelEdit(); // Reset editing state
  };

  const cancelEdit = () => {
    editingEntryId.value = null;
    currentEditText.value = '';
  };

  const requestDeleteEntry = async (entryId: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту запись? Это действие необратимо.')) {
      return;
    }
    entryError.value = '';
    const deleted = await userProfileStore.deleteDiaryEntry(entryId);
    if (!deleted) {
      entryError.value = 'Не удалось удалить запись. Попробуйте ещё раз.';
      return;
    }
    if (editingEntryId.value === entryId) {
      // If deleting the entry currently being edited
      cancelEdit();
    }
  };
  // --- End Editing State & Logic ---

  const submitNewEntry = async () => {
    if (newEntryText.value.trim() === '') return;
    isSavingEntry.value = true;
    entryError.value = '';
    const saved = await userProfileStore.addDiaryEntry(newEntryText.value.trim());
    if (saved) newEntryText.value = '';
    else entryError.value = 'Не удалось сохранить запись. Текст не потерян — попробуйте ещё раз.';
    isSavingEntry.value = false;
  };

  const sortedDiaryEntries = computed(() => {
    return [...diaryEntries.value].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  });

  const formatEntryDate = (date: string) =>
    new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return {
    diaryEntries,
    newEntryText,
    entryError,
    isSavingEntry,
    composerTextarea,
    focusComposer,
    editingEntryId,
    currentEditText,
    startEdit,
    saveEdit,
    cancelEdit,
    requestDeleteEntry,
    submitNewEntry,
    sortedDiaryEntries,
    formatEntryDate,
  };
}
