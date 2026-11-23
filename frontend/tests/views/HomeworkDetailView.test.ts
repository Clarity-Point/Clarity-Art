import { flushPromises, mount } from '@vue/test-utils';
import axios from 'axios';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import HomeworkDetailView from '@/views/HomeworkDetailView.vue';

afterEach(() => vi.restoreAllMocks());

it('leaves the next assignment draft intact when the previous submission finishes late', async () => {
  vi.spyOn(axios, 'get').mockImplementation(async (url) => {
    const id = url.endsWith('/first') ? 'first' : 'second';
    if (url.includes('/drafts/')) return { data: { text: `Draft ${id}`, version: 1 } };
    return { data: { title: id, description: id, courseSlug: 'study', courseTitle: 'Study' } };
  });
  const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: { version: 2 } });
  let finishSubmission!: (response: { data: object }) => void;
  const pending = new Promise<{ data: object }>((resolve) => {
    finishSubmission = resolve;
  });
  const post = vi.spyOn(axios, 'post').mockReturnValueOnce(pending);
  const pinia = createPinia();
  useAuthStore(pinia).user = { id: 'owner' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/homework/:homeworkId', component: HomeworkDetailView },
      { path: '/courses/:courseId', name: 'CourseDetail', component: { template: '<main />' } },
    ],
  });
  await router.push('/homework/first');
  const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } });
  try {
    await flushPromises();
    await wrapper.get('.submission-actions button').trigger('click');
    await flushPromises();
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/api/homework',
      { homeworkId: 'first', homeworkTitle: 'first', submittedContent: 'Draft first' },
      { headers: { 'X-Expected-User-Id': 'owner' } },
    );

    await router.push('/homework/second');
    await flushPromises();
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Draft second');

    finishSubmission({ data: {} });
    await flushPromises();
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Draft second');
    expect(wrapper.find('.submission-feedback').exists()).toBe(false);
    expect(put).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});
