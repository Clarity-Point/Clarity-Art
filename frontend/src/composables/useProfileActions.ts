import { ref, computed } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Standalone profile actions for UserProfileView: AI-backed profile analysis
 * (POST /profile/analysis), PDF export and joining an organization.
 */
export function useProfileActions() {
  const userProfileStore = useUserProfileStore();
  const storeProfileRef = storeToRefs(userProfileStore).profile;

  // --- Comprehensive analysis ---
  const profileAnalysisResult = ref<string | null>(null);
  const isAnalyzingProfile = ref(false);
  const profileAnalysisError = ref<string | null>(null);

  const noAnalysisData = computed(() => {
    const p = storeProfileRef.value;
    return (
      !p?.name &&
      (!p?.imageAnalysisHistory || p.imageAnalysisHistory.length === 0) &&
      (!p?.courseProgress || p.courseProgress.length === 0) &&
      (!p?.homeworkHistory || p.homeworkHistory.length === 0)
    );
  });

  const performProfileAnalysis = async () => {
    isAnalyzingProfile.value = true;
    profileAnalysisError.value = null;
    try {
      // Real, server-side analysis. The backend builds a prompt from the profile
      // and runs it through the provider-agnostic AI service (with a graceful
      // canned fallback when no AI provider is configured).
      const response = await axios.post(`${API_URL}/profile/analysis`);
      profileAnalysisResult.value = response.data.analysis || 'Не удалось получить анализ профиля.';
    } catch {
      profileAnalysisError.value = 'Ошибка анализа';
    } finally {
      isAnalyzingProfile.value = false;
    }
  };

  // --- PDF export ---
  const isExporting = ref(false);

  const downloadPDF = async () => {
    isExporting.value = true;
    try {
      const response = await axios.get(`${API_URL}/profile/export-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Healing-Diary.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Ошибка при генерации PDF');
    } finally {
      isExporting.value = false;
    }
  };

  // --- Organization ---
  const inviteCode = ref('');

  const joinOrganization = async () => {
    if (!inviteCode.value) return;
    try {
      const response = await axios.post(`${API_URL}/org/join`, { inviteCode: inviteCode.value });
      alert(response.data.message);
      window.location.reload();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      alert('Ошибка: ' + (err.response?.data?.error || 'Не удалось присоединиться'));
    }
  };

  return {
    profileAnalysisResult,
    isAnalyzingProfile,
    profileAnalysisError,
    noAnalysisData,
    performProfileAnalysis,
    isExporting,
    downloadPDF,
    inviteCode,
    joinOrganization,
  };
}
