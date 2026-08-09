import { ref, computed } from 'vue';
import axios from 'axios';
import { useUserProfileStore } from '@/stores/userProfileStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface ExtendedQuestion {
  text: string;
  rationale: string;
}

/**
 * Image-analysis state and behaviour for ImageAnalysisView: file upload,
 * primary AI analysis, the extended self-reflection questionnaire and the
 * read-only history list. Extracted verbatim — same endpoints, same reactive
 * shape, same store mutations and side-effects. Canvas drawing lives in
 * useCanvasDrawing; the view wires the two together for canvas analysis.
 */
export function useImageAnalysis() {
  const userProfileStore = useUserProfileStore();

  // --- Common State ---
  const analysisResult = ref<string | null>(null); // Stores the initial AI analysis
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);
  const currentAnalysisPreview = ref<string | null>(null);
  const analysisType = ref<'upload' | 'canvas' | 'extended' | null>(null);
  const currentAnalysisTimestamp = ref<string | null>(null);
  const extendedAnalysisDisplay = ref<string | null>(null); // Stores the AI's response to the extended analysis

  const showExtendedAnalysis = ref(false);
  const extendedAnalysisAnswers = ref<Record<number, string>>({});

  const openExtendedAnalysis = () => {
    showExtendedAnalysis.value = true;
    extendedAnalysisQuestions.value.forEach((_, index) => {
      if (extendedAnalysisAnswers.value[index] === undefined) {
        extendedAnalysisAnswers.value[index] = '';
      }
    });
  };

  const extendedAnalysisQuestions = ref<ExtendedQuestion[]>([
    {
      text: 'Расскажите, что вы нарисовали? / Опишите, что вы видите на этом рисунке.',
      rationale:
        'Это самый открытый и базовый вопрос. Он дает клиенту возможность самому начать повествование, определить важные для него элементы и задать тон всему обсуждению. Вы сразу видите, на что человек обращает внимание в первую очередь.',
    },
    {
      text: 'Как вы себя чувствовали, когда создавали этот рисунок? Какие эмоции испытывали?',
      rationale:
        'Арт-терапия – это про чувства. Этот вопрос напрямую связывает процесс творчества с эмоциональным состоянием клиента, что является ключевым для понимания.',
    },
    {
      text: 'Есть ли у этого рисунка название? Если да, то какое? Если нет, то как бы вы могли его назвать сейчас?',
      rationale:
        'Название – это концентрированная суть, метафора или основная идея, которую клиент вкладывает в работу. Оно может многое сказать о его восприятии.',
    },
    {
      text: 'Какая часть рисунка (или какой элемент) для вас здесь самая важная/значимая? Почему?',
      rationale:
        'Помогает сфокусироваться на ключевых символах или зонах рисунка, которые несут основную смысловую или эмоциональную нагрузку для клиента.',
    },
    {
      text: 'Какие цвета вы выбрали и почему именно их? Что для вас значит этот цвет (или сочетание цветов) здесь?',
      rationale:
        'Цвет – мощный носитель эмоций и символов. Понимание личного значения цвета для клиента (а не общепринятых трактовок) очень важно.',
    },
    {
      text: 'Если бы этот рисунок мог рассказать историю, о чем бы она была?',
      rationale:
        'Переводит визуальный образ в нарратив, помогает выявить скрытые сюжеты, конфликты, желания или страхи. Это проективный вопрос, раскрывающий внутренний мир.',
    },
    {
      text: 'Как этот рисунок связан с вами, вашей жизнью или вашими текущими переживаниями/чувствами?',
      rationale:
        'Это прямой мост между творческим продуктом и личным опытом клиента. Без этой связки анализ будет неполным. Это помогает клиенту увидеть отражение себя в своем творчестве.',
    },
    {
      text: 'Какие чувства или мысли вызывает у вас этот рисунок, когда вы на него смотрите сейчас?',
      rationale:
        'Оценка рисунка "после" создания может отличаться от чувств "во время". Это помогает увидеть динамику, рефлексию и, возможно, новые инсайты.',
    },
  ]);

  // --- File Upload State & Logic ---
  const selectedImageFile = ref<File | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const handleImageUpload = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      selectedImageFile.value = target.files[0];
      analysisResult.value = null;
      errorMessage.value = null;
      extendedAnalysisDisplay.value = null;
      showExtendedAnalysis.value = false;
      extendedAnalysisAnswers.value = {};

      // Set currentAnalysisPreview to data URL for consistency
      const reader = new FileReader();
      reader.onload = (e) => {
        currentAnalysisPreview.value = e.target?.result as string;
      };
      reader.readAsDataURL(selectedImageFile.value);
    } else {
      selectedImageFile.value = null;
      if (analysisType.value === 'upload') currentAnalysisPreview.value = null;
    }
  };

  const triggerFileUploadAnalyze = () => {
    if (!selectedImageFile.value) {
      errorMessage.value = 'Пожалуйста, сначала выберите изображение для загрузки.';
      return;
    }
    analysisType.value = 'upload';
    performAnalysis(selectedImageFile.value);
  };

  const performAnalysis = async (source: File | string) => {
    isLoading.value = true;
    analysisResult.value = null;
    errorMessage.value = null;
    currentAnalysisTimestamp.value = null;
    showExtendedAnalysis.value = false;
    extendedAnalysisAnswers.value = {};
    extendedAnalysisDisplay.value = null;

    let base64Image: string;
    let mimeType: string;
    let originalName: string | undefined = undefined;
    let promptText =
      'Подробно опиши это изображение. Что ты видишь? Какие эмоции или темы оно может представлять?';

    if (source instanceof File) {
      mimeType = source.type;
      originalName = source.name;
      // Ensure currentAnalysisPreview is a data URL for uploaded files as well
      base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const resultStr = reader.result as string;
          currentAnalysisPreview.value = resultStr; // Store the full data URL
          resolve(resultStr.split(',')[1]); // Resolve with base64 part
        };
        reader.onerror = reject;
        reader.readAsDataURL(source);
      });
      if (!base64Image) {
        // Handle potential error from promise
        errorMessage.value = 'Не удалось обработать файл изображения.';
        isLoading.value = false;
        return;
      }
    } else {
      // It's a dataURL from canvas
      mimeType = 'image/png';
      base64Image = source.split(',')[1];
      currentAnalysisPreview.value = source; // dataURL is the preview
      promptText =
        'Проанализируй этот рисунок. Что на нем изображено? Какие чувства или идеи он может выражать? Обрати внимание на цвета, формы и композицию.';
      originalName = `рисунок-${new Date().toISOString()}.png`;
    }

    if (!base64Image || !mimeType) {
      errorMessage.value = 'Не удалось получить данные изображения для анализа.';
      isLoading.value = false;
      return;
    }

    const payload = {
      promptText,
      mimeType,
      base64Image,
      originalImageName: originalName,
    };

    try {
      const response = await axios.post(`${API_URL}/analyze-image`, payload);
      if (response.data.reply) {
        analysisResult.value = response.data.reply;
        currentAnalysisTimestamp.value = response.data.timestamp || new Date().toISOString();
        if (currentAnalysisPreview.value && analysisResult.value) {
          userProfileStore.addImageAnalysis({
            timestamp: currentAnalysisTimestamp.value || new Date().toISOString(),
            id: response.data.analysisId,
            imagePreviewUrl: currentAnalysisPreview.value,
            analysisText: analysisResult.value,
            originalImageName: originalName,
          });
        }
      } else {
        errorMessage.value = 'Не удалось извлечь анализ из ответа API.';
      }
    } catch (apiError) {
      console.error('Error during backend image analysis call:', apiError);
      if (axios.isAxiosError(apiError) && apiError.response) {
        errorMessage.value = `Ошибка: ${apiError.response.data?.error || 'Не удалось выполнить анализ'}`;
      } else {
        errorMessage.value = 'Произошла непредвиденная ошибка при обмене данными с сервером.';
      }
    } finally {
      isLoading.value = false;
    }
  };

  const submitExtendedAnalysis = async () => {
    if (!currentAnalysisPreview.value || !currentAnalysisTimestamp.value) {
      errorMessage.value =
        'Нет активного анализа для расширения. Пожалуйста, сначала проанализируйте изображение.';
      return;
    }
    if (!areAllExtendedQuestionsAnswered.value) {
      errorMessage.value =
        'Пожалуйста, ответьте на все вопросы перед отправкой расширенного анализа.';
      return;
    }

    isLoading.value = true;
    analysisType.value = 'extended';
    errorMessage.value = null;
    extendedAnalysisDisplay.value = null;

    let base64Image: string;
    let mimeType: string;

    if (currentAnalysisPreview.value && currentAnalysisPreview.value.startsWith('data:image')) {
      const parts = currentAnalysisPreview.value.split(';');
      mimeType = parts[0].split(':')[1];
      base64Image = parts[1].split(',')[1];
    } else {
      errorMessage.value =
        'Не удалось получить данные изображения для расширенного анализа из предпросмотра. Предпросмотр отсутствует или имеет неверный формат.';
      isLoading.value = false;
      analysisType.value = null;
      return;
    }

    let extendedPrompt = 'Данные о изображении и ответы пользователя на вопросы:\n\n';
    extendedAnalysisQuestions.value.forEach((q, index) => {
      extendedPrompt += `Вопрос ${index + 1}: ${q.text}\n`;
      extendedPrompt += `Ответ пользователя: ${extendedAnalysisAnswers.value[index]}\n\n`;
    });
    extendedPrompt +=
      'ответь далее на эти ответы в ответ на расширенны анализ. Пожалуйста, предоставь новый, более глубокий анализ изображения, интегрируя эти ответы.';

    const activeEntry = userProfileStore.profile.imageAnalysisHistory.find(
      (entry) => entry.timestamp === currentAnalysisTimestamp.value,
    );
    const questionsToSave = extendedAnalysisQuestions.value.map((q, index) => ({
      questionText: q.text,
      rationale: q.rationale,
      answer: extendedAnalysisAnswers.value[index] || '',
    }));
    const payload = {
      promptText: extendedPrompt,
      mimeType,
      base64Image,
      analysisId: activeEntry?.id,
      extendedQuestions: questionsToSave,
    };

    try {
      const response = await axios.post(`${API_URL}/analyze-image`, payload);
      if (response.data.reply) {
        const newExtendedAnalysisText = response.data.reply;
        extendedAnalysisDisplay.value = newExtendedAnalysisText;

        userProfileStore.updateImageAnalysis(currentAnalysisTimestamp.value as string, {
          extendedQuestions: questionsToSave,
          extendedAnalysisText: newExtendedAnalysisText,
        });
      } else {
        errorMessage.value = 'Не удалось извлечь расширенный анализ из ответа API.';
      }
    } catch (apiError) {
      console.error('Error during backend extended analysis call:', apiError);
      if (axios.isAxiosError(apiError) && apiError.response) {
        errorMessage.value = `Ошибка: ${apiError.response.data?.error || 'Не удалось выполнить анализ'}`;
      } else {
        errorMessage.value = 'Произошла непредвиденная ошибка при обмене данными с сервером.';
      }
    } finally {
      isLoading.value = false;
      analysisType.value = null;
    }
  };

  const areAllExtendedQuestionsAnswered = computed(() => {
    if (!showExtendedAnalysis.value) return false;
    return extendedAnalysisQuestions.value.every(
      (_, index) => extendedAnalysisAnswers.value[index]?.trim() !== '',
    );
  });

  // --- View-only: history display helpers (read-only, no store mutation) ---
  const historyEntries = computed(() => userProfileStore.profile.imageAnalysisHistory || []);

  const formatHistoryDate = (timestamp: string): string => {
    try {
      return new Date(timestamp).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const truncate = (text: string, maxLen: number): string => {
    if (!text) return '';
    return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
  };

  return {
    analysisResult,
    isLoading,
    errorMessage,
    currentAnalysisPreview,
    analysisType,
    currentAnalysisTimestamp,
    extendedAnalysisDisplay,
    showExtendedAnalysis,
    extendedAnalysisAnswers,
    extendedAnalysisQuestions,
    openExtendedAnalysis,
    selectedImageFile,
    fileInputRef,
    handleImageUpload,
    triggerFileUploadAnalyze,
    performAnalysis,
    submitExtendedAnalysis,
    areAllExtendedQuestionsAnswered,
    historyEntries,
    formatHistoryDate,
    truncate,
  };
}
