import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { computed, defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { useServerDraft } from '@/composables/useServerDraft';

afterEach(() => vi.restoreAllMocks());

it('rejects save waiters from the previous account without submitting the new draft', async () => {
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { text: '', version: 0 } });
  let finishSave!: (response: { data: { version: number } }) => void;
  const firstSave = new Promise<{ data: { version: number } }>((resolve) => {
    finishSave = resolve;
  });
  const put = vi
    .spyOn(axios, 'put')
    .mockReturnValueOnce(firstSave)
    .mockResolvedValue({ data: { version: 1 } });
  const pinia = createPinia();
  const auth = useAuthStore(pinia);
  auth.user = { id: 'first' };
  const draftText = ref('');
  let draft!: ReturnType<typeof useServerDraft>;
  const page = defineComponent({
    setup() {
      draft = useServerDraft(
        draftText,
        'diary',
        computed(() => 'new'),
      );
      return () => h('main');
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: page }],
  });
  await router.push('/');
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } });
  try {
    await flushPromises();
    draftText.value = 'First account';
    const original = draft.flushDraft();
    const waiter = draft.flushDraft();

    auth.user = { id: 'second' };
    await flushPromises();
    expect(draft.draftReady.value).toBe(true);
    draftText.value = 'Second account';
    finishSave({ data: { version: 1 } });
    await expect(original).resolves.toBe(false);
    await expect(waiter).resolves.toBe(false);
    expect(put).toHaveBeenCalledTimes(1);
    await expect(draft.flushDraft()).resolves.toBe(true);
    expect(put).toHaveBeenLastCalledWith(
      '/api/drafts/diary/new',
      { text: 'Second account', version: 0 },
      { headers: { 'X-Expected-User-Id': 'second' } },
    );
  } finally {
    wrapper.unmount();
  }
});
