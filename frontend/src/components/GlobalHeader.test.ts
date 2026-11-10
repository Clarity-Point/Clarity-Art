import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import axios from 'axios';
import GlobalHeader from './GlobalHeader.vue';
import { useAuthStore } from '@/stores/authStore';

afterEach(() => vi.restoreAllMocks());
describe('notification session isolation', () => {
  it('clears old notifications and rejects late responses after switching accounts', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'first' };
    let resolveOld!: (value: unknown) => void;
    const current = {
      data: [
        {
          id: 'new',
          title: 'New notification',
          message: 'New content',
          isRead: false,
          date: '2026-11-10',
        },
      ],
      headers: { 'x-unread-count': '12' },
    };
    vi.spyOn(axios, 'get')
      .mockResolvedValue(current)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    const wrapper = mount(GlobalHeader, {
      props: { drawerOpen: false },
      global: {
        plugins: [pinia, router],
        stubs: { Icon: true, BrandLogo: true, RouterLink: true },
      },
    });
    auth.expireSession();
    auth.user = { id: 'second' };
    await flushPromises();
    resolveOld({ data: [{ id: 'old', title: 'Private old notification' }], headers: {} });
    await flushPromises();
    await wrapper.get('[aria-label="Уведомления"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('New notification');
    expect(wrapper.text()).not.toContain('Private old notification');
    expect(wrapper.get('.noti-dot').text()).toBe('12');
    auth.expireSession();
    await flushPromises();
    expect(wrapper.text()).not.toContain('New notification');
    wrapper.unmount();
  });
});
