import { onMounted, ref } from 'vue';
import axios from 'axios';
import { useToastStore } from '@/stores/toastStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface AIStatus {
  configured: boolean;
  processingMode: 'local' | 'external';
  requiresConsent: boolean;
  consentGiven: boolean;
}

export function useAiConsent() {
  const status = ref<AIStatus | null>(null);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const toastStore = useToastStore();

  const fetchStatus = async () => {
    isLoading.value = true;
    try {
      const response = await axios.get(`${API_URL}/ai/status`);
      status.value = response.data;
    } catch {
      toastStore.error('Не удалось получить настройки обработки данных AI.');
    } finally {
      isLoading.value = false;
    }
  };

  const setConsent = async (consent: boolean) => {
    if (!status.value || isSaving.value) return;
    const previous = status.value.consentGiven;
    status.value.consentGiven = consent;
    isSaving.value = true;
    try {
      const response = await axios.put(`${API_URL}/profile/ai-consent`, { consent });
      status.value.consentGiven = response.data.consentGiven;
      toastStore.success(consent ? 'Согласие сохранено.' : 'Согласие отозвано.');
    } catch {
      status.value.consentGiven = previous;
      toastStore.error('Не удалось изменить согласие.');
    } finally {
      isSaving.value = false;
    }
  };

  onMounted(fetchStatus);
  return {
    aiStatus: status,
    isAiStatusLoading: isLoading,
    isAiConsentSaving: isSaving,
    setConsent,
  };
}
