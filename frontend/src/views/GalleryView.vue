<template>
  <div class="page">
    <header class="page-head">
      <h1 class="page-title display">Социальное арт-пространство</h1>
      <p class="page-subtitle">
        Вдохновляйтесь работами других участников нашего сообщества — каждая из них создана с
        заботой о себе.
      </p>
    </header>

    <div v-if="isLoading" class="grid grid-auto">
      <div v-for="n in 6" :key="n" class="gallery-card">
        <div class="skeleton gallery-cover-skeleton"></div>
        <div class="gallery-body">
          <div class="skeleton" style="height: 14px; width: 55%; margin-bottom: 12px"></div>
          <div class="skeleton" style="height: 12px; width: 90%; margin-bottom: 6px"></div>
          <div class="skeleton" style="height: 12px; width: 70%"></div>
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="empty-state">
      <span class="empty-icon"><Icon name="alert-triangle" :size="32" /></span>
      <p>{{ errorMessage }}</p>
      <button class="btn-outline" @click="fetchGallery">Повторить</button>
    </div>

    <div v-else-if="galleryItems.length" class="grid grid-auto">
      <article v-for="item in galleryItems" :key="item.id" class="gallery-card card-hoverable">
        <div class="gallery-cover">
          <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.prompt" loading="lazy" />
          <Icon v-else name="palette" :size="30" />
        </div>
        <div class="gallery-body">
          <div class="gallery-author row">
            <span class="avatar">{{ initialsOf(item.userName) }}</span>
            <div class="author-meta">
              <div class="author-name">{{ item.userName || 'Гость сообщества' }}</div>
              <div class="gallery-date faint">{{ formatDate(item.date) }}</div>
            </div>
          </div>

          <p class="gallery-prompt"><span class="muted">Запрос:</span> {{ item.prompt }}</p>

          <div class="gallery-result muted">
            <VueMarkdown :source="previewOf(item.result)" />
          </div>

          <div class="gallery-footer row-between">
            <span class="chip badge-accent">Работа сообщества</span>
            <button
              @click="like(item.id)"
              class="like-btn"
              :class="{ liked: item.liked, pending: pendingLikes.has(item.id) }"
              :disabled="pendingLikes.has(item.id)"
              :aria-pressed="item.liked ? 'true' : 'false'"
              :aria-label="
                item.liked
                  ? `Вы уже поддержали эту работу (сейчас ${item.likes || 0})`
                  : `Поддержать работу (сейчас ${item.likes || 0})`
              "
            >
              <Icon name="heart" :size="16" />
              {{ item.likes || 0 }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="image" :size="32" /></span>
      <p>Пока никто не поделился работой. Будьте первыми — это вдохновляет других.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import VueMarkdown from 'vue-markdown-render';
import Icon from '@/components/Icon.vue';
import { useToastStore } from '@/stores/toastStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface GalleryItem {
  id: string;
  userName: string;
  date: string;
  prompt: string;
  result: string;
  likes: number;
  liked?: boolean;
  imageUrl?: string;
}

const galleryItems = ref<GalleryItem[]>([]);
const isLoading = ref(true);
const errorMessage = ref('');
const pendingLikes = ref<Set<string>>(new Set());
const toastStore = useToastStore();

const fetchGallery = async () => {
  try {
    isLoading.value = true;
    errorMessage.value = '';
    const response = await axios.get(`${API_URL}/gallery`);
    galleryItems.value = response.data;
  } catch (error) {
    console.error('Failed to fetch gallery:', error);
    errorMessage.value = 'Не удалось загрузить галерею. Проверьте соединение.';
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await fetchGallery();
});

const like = async (id: string) => {
  // Guard against double submission: rapid taps previously fired several POSTs
  // for the same work, and a failure was invisible because only the console
  // knew about it — the heart simply never changed.
  if (pendingLikes.value.has(id)) return;
  pendingLikes.value = new Set(pendingLikes.value).add(id);
  try {
    const response = await axios.post(`${API_URL}/gallery/like/${id}`);
    const item = galleryItems.value.find((i) => i.id === id);
    if (item) {
      item.likes = response.data.likes;
      item.liked = true;
    }
  } catch (error) {
    console.error('Failed to like post:', error);
    toastStore.error('Не удалось поставить отметку «нравится». Попробуйте ещё раз.');
  } finally {
    const next = new Set(pendingLikes.value);
    next.delete(id);
    pendingLikes.value = next;
  }
};

// View-only helpers (no business logic / no data changes)
const initialsOf = (name: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '·';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const previewOf = (result: string) => {
  const text = result || '';
  return text.length > 140 ? `${text.substring(0, 140)}...` : text;
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.gallery-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.gallery-cover {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-soft), var(--accent-soft));
}
.gallery-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery-cover-skeleton {
  height: 140px;
  border-radius: 0;
}

.gallery-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  flex: 1;
}

.gallery-author {
  margin-bottom: var(--space-3);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
  color: var(--on-primary);
  font-size: var(--text-xs);
  font-weight: 700;
  flex-shrink: 0;
}

.author-meta {
  min-width: 0;
}
.author-name {
  font-weight: 600;
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gallery-date {
  font-size: var(--text-xs);
}

.gallery-prompt {
  font-size: var(--text-sm);
  color: var(--text-color);
  margin-bottom: var(--space-2);
}

.gallery-result {
  font-size: var(--text-sm);
  line-height: 1.5;
  max-height: 4.6em;
  overflow: hidden;
  margin-bottom: var(--space-4);
  flex: 1;
}
.gallery-result :deep(p) {
  margin: 0;
}

.gallery-footer {
  margin-top: auto;
}

.like-btn {
  background: var(--danger-bg);
  border: 1px solid transparent;
  color: var(--danger-text);
  padding: 6px 14px;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 600;
}

.like-btn:hover {
  background: color-mix(in srgb, var(--danger-color) 16%, var(--danger-bg));
  border-color: color-mix(in srgb, var(--danger-color) 40%, transparent);
}

.like-btn.liked {
  background: var(--danger-color);
  color: #fff;
}

.like-btn.pending {
  opacity: 0.6;
  cursor: progress;
}
</style>
