import { ref, onMounted } from 'vue';
import { useUserProfileStore, type UserProfile } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Editable profile form + health/therapist persistence for UserProfileView.
 * Owns the local editable `profile` mirror, hydrates it from the store on
 * mount and writes changes back.
 *
 * Health metrics (heart rate, steps, sleep) are entered manually, so the data
 * can come from ANY wearable, watch or fitness tracker — the user simply reads
 * the numbers off their device and types them in. No vendor-specific SDK
 * (Apple HealthKit, Google Fit, etc.) is required. `loadSampleHealthData` is an
 * explicit demo helper that fills placeholder values for previews.
 */
export function useProfileForm() {
  const userProfileStore = useUserProfileStore();
  const storeProfileRef = storeToRefs(userProfileStore).profile;

  const isSyncing = ref(false);
  const profileMessage = ref('');
  const healthMessage = ref('');
  const therapistMessage = ref('');
  const therapists = ref<Array<{ id: string; name: string }>>([]);

  const profile = ref({
    name: '',
    age: null as number | null,
    interests: '',
    goals: '',
    concerns: '',
    category: 'general' as UserProfile['category'],
    preferredStyle: '',
    preferences: '',
    additionalInfo: '',
    sleepHours: 0,
    heartRateAvg: 0,
    stepsCount: 0,
    isSharedWithTherapist: false,
    therapistId: '',
  });

  onMounted(async () => {
    if (storeProfileRef.value) {
      profile.value.name = storeProfileRef.value.name || '';
      profile.value.age = storeProfileRef.value.age ?? null;
      profile.value.goals = storeProfileRef.value.therapyGoals || '';
      profile.value.concerns = storeProfileRef.value.mainConcerns || '';
      profile.value.category = storeProfileRef.value.category || 'general';
      profile.value.preferredStyle = storeProfileRef.value.preferredStyle || '';
      profile.value.interests = Array.isArray(storeProfileRef.value.interests)
        ? storeProfileRef.value.interests.join(', ')
        : '';
      profile.value.preferences = storeProfileRef.value.preferences || '';
      profile.value.additionalInfo = storeProfileRef.value.additionalInfo || '';
      profile.value.sleepHours = storeProfileRef.value.sleepHours || 0;
      profile.value.heartRateAvg = storeProfileRef.value.heartRateAvg || 0;
      profile.value.stepsCount = storeProfileRef.value.stepsCount || 0;
      profile.value.isSharedWithTherapist = storeProfileRef.value.isSharedWithTherapist || false;
      profile.value.therapistId = storeProfileRef.value.therapistId || '';
    }
    try {
      therapists.value = (await axios.get(`${API_URL}/therapists`)).data;
    } catch {
      therapistMessage.value = 'Не удалось загрузить список терапевтов.';
    }
  });

  // Persist the manually-entered metrics. Works with any device: the user reads
  // heart rate / steps / sleep off whatever watch or tracker they use and enters
  // them here — no vendor lock-in to Apple Health or Google Fit.
  const saveHealthData = async () => {
    healthMessage.value = '';
    const saved = await userProfileStore.updateProfile({
      sleepHours: profile.value.sleepHours,
      heartRateAvg: profile.value.heartRateAvg,
      stepsCount: profile.value.stepsCount,
    });
    healthMessage.value = saved ? 'Показатели сохранены.' : 'Не удалось сохранить показатели.';
    return saved;
  };

  // Explicit demo helper: fills the metrics with sample values so previews and
  // screenshots have something to show. Clearly labelled as demo data — it does
  // NOT read from any real device.
  const loadSampleHealthData = async () => {
    isSyncing.value = true;
    setTimeout(async () => {
      profile.value.heartRateAvg = 72;
      profile.value.stepsCount = 6540;
      profile.value.sleepHours = 7.5;
      await saveHealthData();
      isSyncing.value = false;
      healthMessage.value = 'Демонстрационные показатели загружены и сохранены.';
    }, 800);
  };

  const saveTherapistSettings = async () => {
    therapistMessage.value = '';
    if (profile.value.isSharedWithTherapist && !profile.value.therapistId.trim()) {
      therapistMessage.value = 'Введите ID терапевта и нажмите «Сохранить доступ».';
      return false;
    }
    try {
      await axios.put(`${API_URL}/profile/therapist-access`, {
        isSharedWithTherapist: profile.value.isSharedWithTherapist,
        therapistId: profile.value.therapistId.trim(),
      });
      userProfileStore.hydrateProfile({
        ...storeProfileRef.value,
        isSharedWithTherapist: profile.value.isSharedWithTherapist,
        therapistId: profile.value.therapistId.trim(),
      });
      therapistMessage.value = 'Настройки доступа сохранены.';
      return true;
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      therapistMessage.value = message || 'Не удалось сохранить настройки доступа.';
      return false;
    }
  };

  const saveProfile = async () => {
    profileMessage.value = '';
    const saved = await userProfileStore.updateProfile({
      name: profile.value.name,
      age: profile.value.age,
      therapyGoals: profile.value.goals,
      mainConcerns: profile.value.concerns,
      category: profile.value.category,
      preferredStyle: profile.value.preferredStyle,
      interests: profile.value.interests
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s),
      preferences: profile.value.preferences,
      additionalInfo: profile.value.additionalInfo,
    });
    profileMessage.value = saved ? 'Профиль сохранён.' : 'Не удалось сохранить профиль.';
  };

  return {
    profile,
    isSyncing,
    profileMessage,
    healthMessage,
    therapistMessage,
    therapists,
    loadSampleHealthData,
    saveHealthData,
    saveTherapistSettings,
    saveProfile,
  };
}
