<script setup lang="ts">
import { ref, watch } from 'vue';
import { practiceError, usePracticeApi } from './api';

const props = defineProps<{ path: string; title: string; download?: boolean }>();
const { auth, capture, isCurrent, request } = usePracticeApi();
const url = ref('');
const error = ref('');
const extension = ref('png');
const retry = ref(0);

watch(
  () => [props.path, auth.user?.id, auth.sessionRevision, retry.value],
  async (_current, _previous, onCleanup) => {
    const session = capture();
    const abort = new AbortController();
    url.value = '';
    error.value = '';
    if (!session.id) return;
    let objectUrl = '';
    onCleanup(() => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    try {
      const image = await request<Blob>(session, props.path, {
        responseType: 'blob',
        signal: abort.signal,
      });
      if (abort.signal.aborted || !isCurrent(session)) return;
      extension.value =
        image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/webp' ? 'webp' : 'png';
      objectUrl = URL.createObjectURL(image);
      url.value = objectUrl;
    } catch (reason) {
      if (!abort.signal.aborted && isCurrent(session))
        error.value = practiceError(reason, 'Изображение недоступно.');
    }
  },
  { immediate: true, flush: 'sync' },
);
</script>

<template>
  <figure v-if="url" class="practice-image">
    <img :src="url" :alt="`Работа «${title}»`" />
    <figcaption v-if="download">
      <a class="btn-outline" :href="url" :download="`drawing.${extension}`">Скачать рисунок</a>
    </figcaption>
  </figure>
  <div v-else-if="error">
    <p role="alert">{{ error }}</p>
    <button type="button" class="btn-outline" @click="retry++">Повторить загрузку рисунка</button>
  </div>
  <p v-else class="muted" role="status">Загружаем рисунок…</p>
</template>

<style scoped>
.practice-image {
  margin: 0;
}
.practice-image img {
  display: block;
  width: 100%;
  max-height: 28rem;
  object-fit: contain;
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}
.practice-image figcaption {
  margin-block-start: var(--space-3);
}
</style>
