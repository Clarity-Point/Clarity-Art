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

  function applyProfile(profile: Record<string, unknown>) {
    user.value = {
      id: typeof profile.id === 'string' ? profile.id : undefined,
      email: typeof profile.email === 'string' ? profile.email : undefined,
      name: typeof profile.name === 'string' ? profile.name : undefined,
      role: typeof profile.role === 'string' ? profile.role : undefined,
      organizationId:
        typeof profile.organizationId === 'string' ? profile.organizationId : undefined,
    };
    profileStore.hydrateProfile(profile);
    if (typeof profile.streak === 'number') useAnalyticsStore().hydrateStreak(profile.streak);
  }

  async function login(email: string, password: string) {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password });
      user.value = response.data.user;
      if (response.data.user?.profile) profileStore.hydrateProfile(response.data.user.profile);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async function register(email: string, password: string, name: string) {
    try {
      await axios.post(`${API_URL}/register`, { email, password, name });
      return await login(email, password);
    } catch (error) {
      console.error('Registration failed:', error);
      return false;
    }
  }

  async function logout() {
    try {
      await axios.post(`${API_URL}/logout`);
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      user.value = null;
    }
  }

  async function restoreSession() {
    try {
      const response = await axios.get(`${API_URL}/profile`);
      applyProfile(response.data);
      return true;
    } catch {
      user.value = null;
      return false;
    }
  }

  async function fetchProfile() {
    await restoreSession();
  }

  return { user, isAuthenticated, isAdmin, login, register, logout, restoreSession, fetchProfile };
});
