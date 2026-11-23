import { ref, watch } from 'vue';
import axios from 'axios';
import { useToastStore } from '@/stores/toastStore';
import { usePracticeApi } from '@/features/practices/api';

export interface AIStatus {
  configured: boolean;
  processingMode: 'local' | 'external';
  requiresConsent: boolean;
  consentGiven: boolean;
  policy?: { id: string; label: string } | null;
}

export function useAiConsent() {
  const status = ref<AIStatus | null>(null);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const toast = useToastStore();
  const { auth, capture, isCurrent, request } = usePracticeApi();

  async function fetchStatus() {
    const session = capture();
    if (!session.id) return;
    isLoading.value = true;
    try {
      status.value = await request<AIStatus>(session, '/ai/status');
    } catch {
      if (isCurrent(session)) toast.error('Не удалось получить настройки обработки данных.');
    } finally {
      if (isCurrent(session)) isLoading.value = false;
    }
  }

  async function setConsent(consent: boolean) {
    const session = capture();
    const policy = status.value?.policy;
    if (!status.value || isSaving.value || (consent && !policy)) return;
    isSaving.value = true;
    try {
      const response = await request<{ consentGiven: boolean }>(session, '/profile/ai-consent', {
        method: 'PUT',
        data: { consent, policyId: policy?.id },
      });
      if (status.value) status.value.consentGiven = response.consentGiven;
      toast.success(consent ? 'Согласие сохранено.' : 'Согласие отозвано.');
    } catch (reason) {
      if (!isCurrent(session)) return;
      if (axios.isAxiosError(reason) && reason.response?.data?.code === 'AI_POLICY_CHANGED')
        await fetchStatus();
      if (isCurrent(session))
        toast.error('Не удалось изменить согласие. Проверьте текущего поставщика.');
    } finally {
      if (isCurrent(session)) isSaving.value = false;
    }
  }

  watch(
    () => [auth.user?.id, auth.sessionRevision],
    () => {
      status.value = null;
      isSaving.value = false;
      void fetchStatus();
    },
    { immediate: true, flush: 'sync' },
  );
  return {
    aiStatus: status,
    isAiStatusLoading: isLoading,
    isAiConsentSaving: isSaving,
    setConsent,
  };
}
