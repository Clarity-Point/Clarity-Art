<template>
  <div class="page page-narrow">
    <header class="page-head">
      <h1 class="page-title display">Библиотека знаний</h1>
      <p class="page-subtitle">
        Статьи о том, как творчество и звук помогают справляться с тревогой и лучше понимать себя.
      </p>
    </header>

    <div class="search-bar">
      <Icon name="search" :size="18" class="search-icon" />
      <input
        type="text"
        v-model="searchQuery"
        placeholder="Поиск по названию или теме…"
        aria-label="Поиск статей"
      />
    </div>

    <div v-if="filteredArticles.length" class="grid grid-auto articles-grid">
      <article
        v-for="article in filteredArticles"
        :key="article.id"
        class="article-card card card-hoverable"
        role="button"
        tabindex="0"
        @click="openArticle(article)"
        @keydown.enter="openArticle(article)"
      >
        <span class="medallion"><Icon name="book" :size="22" /></span>
        <div class="article-info">
          <span class="badge-primary chip category">{{ article.category }}</span>
          <h3 class="article-title">{{ article.title }}</h3>
          <p class="article-excerpt">{{ article.excerpt }}</p>
          <div class="article-footer">
            <span class="read-time faint">
              <Icon name="clock" :size="14" /> {{ article.readTime }} мин чтение
            </span>
            <span class="read-link"> Читать <Icon name="arrow-right" :size="16" /> </span>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="file-text" :size="32" /></span>
      <p>
        Ничего не нашлось. Попробуйте другой запрос — или загляните позже, библиотека пополняется.
      </p>
    </div>

    <div v-if="selectedArticle" class="article-modal" @click.self="selectedArticle = null">
      <div class="modal-content">
        <button
          class="icon-btn close-btn"
          @click="selectedArticle = null"
          aria-label="Закрыть статью"
        >
          <Icon name="x" :size="20" />
        </button>
        <img :src="selectedArticle.image" :alt="selectedArticle.title" />
        <div class="modal-body">
          <span class="badge-primary chip category">{{ selectedArticle.category }}</span>
          <h2 class="display">{{ selectedArticle.title }}</h2>
          <span class="read-time faint">
            <Icon name="clock" :size="14" /> {{ selectedArticle.readTime }} мин чтение
          </span>
          <div class="article-content" v-html="sanitizedArticleContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DOMPurify from 'dompurify';
import Icon from '@/components/Icon.vue';
import artIntroImage from '@/assets/images/vvedenie-v-art.jpeg';
import emotionImage from '@/assets/images/razvitie_emotii.jpeg';
import musicImage from '@/assets/images/tvorvhestvo-dlya-vseh.jpg';

const searchQuery = ref('');
interface Article {
  id: number;
  category: string;
  title: string;
  excerpt: string;
  readTime: number;
  image: string;
  content: string;
}

const selectedArticle = ref<Article | null>(null);

// Article content may originate from an API, so sanitize before rendering with v-html.
const sanitizedArticleContent = computed(() =>
  selectedArticle.value ? DOMPurify.sanitize(selectedArticle.value.content) : '',
);

const articles = [
  {
    id: 1,
    title: 'Что такое арт-терапия и как она работает?',
    category: 'Основы',
    excerpt: 'Узнайте, как творчество помогает выражать эмоции и находить внутренний покой.',
    content:
      '<p>Арт-терапия — это направление в психотерапии и психологической коррекции, основанное на искусстве и творчестве...</p><p>В процессе творчества человек может выразить то, что сложно облечь в слова. Это особенно важно при работе с травмами и стрессом...</p>',
    image: artIntroImage,
    readTime: 5,
  },
  {
    id: 2,
    title: '5 техник для снятия тревоги через рисование',
    category: 'Практика',
    excerpt: 'Простые упражнения, которые можно выполнить дома за 15 минут.',
    content:
      '<p>1. Нейрографика: рисование линий и сглаживание углов...</p><p>2. Метод мандалы: работа в круге для центрирования...</p>',
    image: emotionImage,
    readTime: 8,
  },
  {
    id: 3,
    title: 'Как музыка влияет на наше эмоциональное состояние',
    category: 'Музыка',
    excerpt: 'Научный взгляд на влияние ритма и мелодии на мозг.',
    content: '<p>Музыка активирует лимбическую систему мозга, отвечающую за эмоции...</p>',
    image: musicImage,
    readTime: 6,
  },
];

const filteredArticles = computed(() => {
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
});

const openArticle = (article: Article) => {
  selectedArticle.value = article;
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.search-bar {
  position: relative;
  margin-bottom: var(--space-6);
}

.search-icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--faint-text);
  pointer-events: none;
}

.search-bar input {
  width: 100%;
  padding: 13px var(--space-4) 13px calc(var(--space-4) * 2 + 18px);
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  box-shadow: var(--shadow-sm);
}

.articles-grid {
  margin-bottom: var(--space-6);
}

.article-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  cursor: pointer;
}

.article-card .medallion {
  margin-bottom: var(--space-4);
}

.article-info {
  width: 100%;
}

.category {
  margin-bottom: var(--space-3);
}

.article-title {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}

.article-excerpt {
  color: var(--muted-text);
  font-size: var(--text-sm);
  line-height: 1.6;
  margin-bottom: var(--space-4);
}

.article-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-xs);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}

.read-time {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.read-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--primary-color);
  font-weight: 600;
}

.article-modal {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: var(--space-5);
}

.modal-content {
  background: var(--card-bg);
  color: var(--text-color);
  width: 100%;
  max-width: 720px;
  max-height: 90vh;
  border-radius: var(--radius-lg);
  overflow-y: auto;
  position: relative;
  box-shadow: var(--shadow-lg);
}

.close-btn {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.modal-content img {
  width: 100%;
  height: 280px;
  object-fit: cover;
}

.modal-body {
  padding: var(--space-6);
}
.modal-body h2 {
  margin-top: var(--space-3);
}
.modal-body .category {
  margin-bottom: var(--space-2);
}

.article-content {
  margin-top: var(--space-5);
  line-height: 1.8;
  color: var(--text-color);
}

@media (max-width: 720px) {
  .modal-content img {
    height: 180px;
  }
  .modal-body {
    padding: var(--space-5);
  }
}
</style>
