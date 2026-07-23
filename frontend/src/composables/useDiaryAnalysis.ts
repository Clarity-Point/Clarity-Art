import { ref, computed } from 'vue';
import { useUserProfileStore, type DiaryEntry } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type AnalysisPeriod = 'day' | 'week' | 'month';

/**
 * Diary period-analysis for DiaryView: builds the prompt from entries within
 * the selected period and calls the chat endpoint. Extracted verbatim — same
 * endpoint, same prompt text, same date-window logic.
 */
export function useDiaryAnalysis() {
  const userProfileStore = useUserProfileStore();
  const { profile } = storeToRefs(userProfileStore);

  const diaryEntries = computed(() => profile.value.diaryEntries || []);

  const analysisPeriod = ref<AnalysisPeriod>('week');
  const isAnalyzingDiary = ref(false);
  const diaryAnalysisResult = ref<string | null>(null);
  const diaryAnalysisError = ref<string | null>(null);

  // --- View-only helper: labels for the segmented period control ---
  const periodOptions: Array<{ value: AnalysisPeriod; label: string }> = [
    { value: 'day', label: 'За день' },
    { value: 'week', label: 'За неделю' },
    { value: 'month', label: 'За месяц' },
  ];

  const getEntriesForPeriod = (): DiaryEntry[] => {
    const now = new Date();
    const startDate = new Date();
    switch (analysisPeriod.value) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }
    startDate.setHours(0, 0, 0, 0);
    return diaryEntries.value.filter((entry) => {
      const entryDate = new Date(entry.date);
      return entryDate >= startDate && entryDate <= now;
    });
  };

  const performDiaryAnalysis = async () => {
    const entriesToAnalyze = getEntriesForPeriod();
    if (entriesToAnalyze.length === 0) {
      diaryAnalysisError.value = `Нет записей для анализа за выбранный период (${analysisPeriod.value}).`;
      diaryAnalysisResult.value = null;
      return;
    }
    isAnalyzingDiary.value = true;
    diaryAnalysisResult.value = null;
    diaryAnalysisError.value = null;
    const entriesText = entriesToAnalyze
      .map((e) => `Дата: ${new Date(e.date).toLocaleString('ru-RU')}\nЗапись: ${e.text}`)
      .join('\n\n---\n\n');
    const prompt = `
Проанализируй следующие записи из дневника пользователя за выбранный период (${analysisPeriod.value}).

Записи для анализа:
${entriesText}
Пожалуйста, предоставь анализ дневниковых записей.
`;

    try {
      const response = await axios.post(`${API_URL}/chat`, { message: prompt });
      if (response.data.reply) {
        diaryAnalysisResult.value = response.data.reply;
      } else {
        diaryAnalysisError.value = 'Не удалось получить анализ дневника.';
      }
    } catch (apiError) {
      console.error('Error during diary analysis:', apiError);
      diaryAnalysisError.value = 'Ошибка при анализе дневника.';
    } finally {
      isAnalyzingDiary.value = false;
    }
  };

  return {
    analysisPeriod,
    isAnalyzingDiary,
    diaryAnalysisResult,
    diaryAnalysisError,
    periodOptions,
    performDiaryAnalysis,
  };
}
