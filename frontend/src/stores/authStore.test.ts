import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import axios from 'axios';
import { useAuthStore } from './authStore';
import { useUserProfileStore } from './userProfileStore';
import { useAnalyticsStore } from './analyticsStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (id: string) => ({ data: { id, name: id, streak: 12 } });

describe('authentication request ordering', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('deduplicates concurrent profile restoration', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const get = vi.spyOn(axios, 'get').mockReturnValue(pending.promise);
    const auth = useAuthStore();
    const first = auth.restoreSession();
    const second = auth.restoreSession();
    pending.resolve(response('user-a'));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(get).toHaveBeenCalledOnce();
  });

  it('does not resurrect a session when a profile response arrives after logout', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    vi.spyOn(axios, 'get').mockReturnValue(pending.promise);
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    const auth = useAuthStore();
    const restoring = auth.restoreSession();
    expect(await auth.logout()).toBe(true);
    pending.resolve(response('old-user'));
    expect(await restoring).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(useUserProfileStore().profile.name).toBe('');
  });

  it('an old restore cannot overwrite a new account or release its pending request', async () => {
    const old = deferred<ReturnType<typeof response>>();
    const fresh = deferred<ReturnType<typeof response>>();
    const get = vi
      .spyOn(axios, 'get')
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const auth = useAuthStore();
    const first = auth.restoreSession();
    auth.expireSession();
    const second = auth.restoreSession();
    old.resolve(response('old-user'));
    await first;
    const third = auth.restoreSession();
    expect(get).toHaveBeenCalledTimes(2);
    fresh.resolve(response('new-user'));
    expect(await second).toBe(true);
    expect(await third).toBe(true);
    expect(auth.user?.id).toBe('new-user');
  });

  it('keeps the verified session when logout fails, allowing a retry', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue(response('user-a'));
    const auth = useAuthStore();
    await auth.restoreSession();
    vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: {} });
    expect(await auth.logout()).toBe(false);
    expect(auth.user?.id).toBe('user-a');
    expect(await auth.logout()).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('preserves loaded data on a temporary profile error and clears it on 401', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValueOnce(response('user-a'));
    const auth = useAuthStore();
    await auth.restoreSession();
    get.mockRejectedValueOnce(new Error('offline'));
    expect(await auth.restoreSession()).toBe(false);
    expect(auth.user?.id).toBe('user-a');
    get.mockRejectedValueOnce(
      new axios.AxiosError('expired', undefined, undefined, undefined, {
        status: 401,
        data: {},
        headers: {},
        statusText: 'Unauthorized',
        config: { headers: new axios.AxiosHeaders() },
      }),
    );
    expect(await auth.restoreSession()).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(useUserProfileStore().profile.name).toBe('');
    expect(useAnalyticsStore().currentStreak).toBe(0);
  });

  it('rejects an incomplete profile instead of creating a phantom session', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    const auth = useAuthStore();
    expect(await auth.restoreSession()).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
  });
  it.each(['login', 'register'] as const)(
    'ignores a delayed %s after the session changes',
    async (operation) => {
      const pending = deferred<{ data: object }>();
      const post = vi.spyOn(axios, 'post').mockReturnValue(pending.promise);
      const get = vi.spyOn(axios, 'get');
      const auth = useAuthStore();
      const request =
        operation === 'login'
          ? auth.login('old@example.test', 'password')
          : auth.register('old@example.test', 'password', 'Old user');
      auth.expireSession();
      pending.resolve({ data: {} });
      expect(await request).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledOnce();
      expect(auth.isAuthenticated).toBe(false);
    },
  );
});
