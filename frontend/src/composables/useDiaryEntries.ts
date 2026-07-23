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
  };

  const saveEdit = () => {
    if (editingEntryId.value && currentEditText.value.trim() !== '') {
      userProfileStore.updateDiaryEntry(editingEntryId.value, {
        text: currentEditText.value.trim(),
      });
    }
    cancelEdit(); // Reset editing state
  };

  const cancelEdit = () => {
    editingEntryId.value = null;
    currentEditText.value = '';
  };

  const requestDeleteEntry = (entryId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить эту запись? Это действие необратимо.')) {
      userProfileStore.deleteDiaryEntry(entryId);
      if (editingEntryId.value === entryId) {
        // If deleting the entry currently being edited
        cancelEdit();
      }
    }
  };
  // --- End Editing State & Logic ---

  const submitNewEntry = () => {
    if (newEntryText.value.trim() === '') return;
    userProfileStore.addDiaryEntry(newEntryText.value);
    newEntryText.value = ''; // Clear textarea
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
