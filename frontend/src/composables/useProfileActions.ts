import { ref, computed } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import { useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Standalone profile actions for UserProfileView: AI-backed profile analysis
 * (POST /profile/analysis), PDF export and joining an organization.
 */
export function useProfileActions() {
  const userProfileStore = useUserProfileStore();
  const toastStore = useToastStore();
  const authStore = useAuthStore();
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
    } catch (error) {
      profileAnalysisError.value =
        axios.isAxiosError(error) && error.response?.status === 412
          ? 'Разрешите использование внешнего AI в разделе «Терапевт и данные».'
          : 'Не удалось выполнить анализ. Попробуйте ещё раз.';
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
      link.setAttribute('download', 'Точка-Ясности-дневник.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toastStore.success('Дневник PDF сформирован и скачан.');
    } catch {
      toastStore.error('Не удалось сформировать PDF. Попробуйте ещё раз.');
    } finally {
      isExporting.value = false;
    }
  };

  // --- Organization ---
  const inviteCode = ref('');

  // --- Account security ---
  const passwordForm = ref({ currentPassword: '', newPassword: '', confirmation: '' });
  const isChangingPassword = ref(false);
  const isManagingAccount = ref(false);
  const accountPassword = ref('');

  const changePassword = async () => {
    if (passwordForm.value.newPassword.length < 8) {
      toastStore.error('Новый пароль должен содержать не менее 8 символов.');
      return;
    }
    if (passwordForm.value.newPassword !== passwordForm.value.confirmation) {
      toastStore.error('Новый пароль и подтверждение не совпадают.');
      return;
    }
    isChangingPassword.value = true;
    try {
      const response = await axios.put(`${API_URL}/account/password`, {
        currentPassword: passwordForm.value.currentPassword,
        newPassword: passwordForm.value.newPassword,
      });
      passwordForm.value = { currentPassword: '', newPassword: '', confirmation: '' };
      toastStore.success(response.data.message || 'Пароль обновлён.');
    } catch (error) {
      toastStore.error(
        axios.isAxiosError(error)
          ? error.response?.data?.error || 'Не удалось обновить пароль.'
          : 'Не удалось обновить пароль.',
      );
    } finally {
      isChangingPassword.value = false;
    }
  };

  const downloadAccountData = async () => {
    isManagingAccount.value = true;
    try {
      const response = await axios.get(`${API_URL}/account/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'clarity-account-data.json';
      link.click();
      URL.revokeObjectURL(url);
      toastStore.success('Полный архив данных скачан.');
    } catch {
      toastStore.error('Не удалось выгрузить данные аккаунта.');
    } finally {
      isManagingAccount.value = false;
    }
  };

  const logoutAllSessions = async () => {
    if (!window.confirm('Завершить все активные сеансы, включая этот?')) return;
    isManagingAccount.value = true;
    try {
      await axios.post(`${API_URL}/account/logout-all`);
      await authStore.logout();
      window.location.assign('/login');
    } catch {
      toastStore.error('Не удалось завершить все сеансы.');
      isManagingAccount.value = false;
    }
  };

  const deleteAccount = async () => {
    if (!accountPassword.value) {
      toastStore.error('Для удаления аккаунта введите текущий пароль.');
      return;
    }
    if (!window.confirm('Удалить аккаунт и все связанные данные без возможности восстановления?')) {
      return;
    }
    isManagingAccount.value = true;
    try {
      await axios.delete(`${API_URL}/account`, { data: { password: accountPassword.value } });
      authStore.expireSession();
      window.location.assign('/register');
    } catch (error) {
      toastStore.error(
        axios.isAxiosError(error)
          ? error.response?.data?.error || 'Не удалось удалить аккаунт.'
          : 'Не удалось удалить аккаунт.',
      );
      isManagingAccount.value = false;
    }
  };

  const joinOrganization = async () => {
    if (!inviteCode.value) return;
    try {
      const response = await axios.post(`${API_URL}/org/join`, { inviteCode: inviteCode.value });
      await authStore.fetchProfile();
      inviteCode.value = '';
      toastStore.success(response.data.message || 'Вы присоединились к организации.');
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toastStore.error(err.response?.data?.error || 'Не удалось присоединиться к организации.');
    }
  };

  const leaveOrganization = async () => {
    if (!window.confirm('Выйти из организации?')) return;
    try {
      await axios.delete(`${API_URL}/org/leave`);
      await authStore.fetchProfile();
      toastStore.success('Вы вышли из организации.');
    } catch (error) {
      toastStore.error(
        axios.isAxiosError(error)
          ? error.response?.data?.error || 'Не удалось выйти из организации.'
          : 'Не удалось выйти из организации.',
      );
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
    leaveOrganization,
    passwordForm,
    isChangingPassword,
    changePassword,
    isManagingAccount,
    accountPassword,
    downloadAccountData,
    logoutAllSessions,
    deleteAccount,
  };
}
