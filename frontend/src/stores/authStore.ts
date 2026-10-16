import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import axios from 'axios';
import { useUserProfileStore } from './userProfileStore';
import { useAnalyticsStore } from './analyticsStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';
axios.defaults.withCredentials = true;

export interface AuthUser {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  organizationId?: string;
  profile?: unknown;
}

export const useAuthStore = defineStore('auth', () => {
  // Authentication is represented by a server-managed HttpOnly cookie. Never
  // persist bearer tokens or user identity in browser storage.
  const user = ref<AuthUser | null>(null);
  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === 'ADMIN');
  const profileStore = useUserProfileStore();
  let restorePromise: Promise<boolean> | null = null;
  let logoutPromise: Promise<boolean> | null = null;
  const sessionRevision = ref(0);

  function applyProfile(profile: Record<string, unknown>) {
    if (typeof profile?.id !== 'string' || !profile.id) throw new Error('Invalid session profile');
    user.value = {
      id: typeof profile.id === 'string' ? profile.id : undefined,
      email: typeof profile.email === 'string' ? profile.email : undefined,
      name: typeof profile.name === 'string' ? profile.name : undefined,
      role: typeof profile.role === 'string' ? profile.role : undefined,
      organizationId:
        typeof profile.organizationId === 'string' ? profile.organizationId : undefined,
    };
    profileStore.hydrateProfile(profile);
    if (typeof profile.streak === 'number' && typeof profile.id === 'string') {
      useAnalyticsStore().hydrateStreak(profile.streak, profile.id);
    }
  }

  async function login(email: string, password: string) {
    expireSession();
    const revision = sessionRevision.value;
    try {
      await axios.post(`${API_URL}/login`, { email, password });
      if (revision !== sessionRevision.value) return false;
      // GET /profile is the canonical, complete shape. Hydrating from the small
      // login response left history, points and progress empty until a reload.
      return await restoreSession();
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async function register(email: string, password: string, name: string) {
    const revision = sessionRevision.value;
    try {
      await axios.post(`${API_URL}/register`, { email, password, name });
      if (revision !== sessionRevision.value) return false;
      return await login(email, password);
    } catch (error) {
      console.error('Registration failed:', error);
      return false;
    }
  }

  function logout(): Promise<boolean> {
    if (logoutPromise) return logoutPromise;
    const revision = ++sessionRevision.value;
    restorePromise = null;
    logoutPromise = (async () => {
      try {
        await axios.post(`${API_URL}/logout`);
        if (revision !== sessionRevision.value) return false;
        expireSession();
        return true;
      } catch {
        // The browser may still hold a valid HttpOnly cookie. Let the user
        // retry instead of presenting a local-only logout as a server logout.
        return false;
      } finally {
        logoutPromise = null;
      }
    })();
    return logoutPromise;
  }

  function restoreSession(): Promise<boolean> {
    if (logoutPromise) return Promise.resolve(false);
    if (restorePromise) return restorePromise;
    const revision = sessionRevision.value;
    restorePromise = (async () => {
      try {
        const response = await axios.get(`${API_URL}/profile`);
        if (revision !== sessionRevision.value) return false;
        applyProfile(response.data);
        return true;
      } catch (error) {
        if (revision !== sessionRevision.value) return false;
        if (axios.isAxiosError(error) && error.response?.status === 401) expireSession();
        // A temporary server/network failure does not invalidate a previously
        // verified session or erase unsaved in-memory work.
        return false;
      } finally {
        // A stale request must not clear a newer request's deduplication lock.
        if (revision === sessionRevision.value) restorePromise = null;
      }
    })();
    return restorePromise;
  }

  async function fetchProfile() {
    await restoreSession();
  }

  function expireSession() {
    sessionRevision.value++;
    restorePromise = null;
    user.value = null;
    profileStore.resetProfile();
    useAnalyticsStore().clearUserAnalytics();
  }

  return {
    user,
    sessionRevision: computed(() => sessionRevision.value),
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    restoreSession,
    fetchProfile,
    expireSession,
  };
});
