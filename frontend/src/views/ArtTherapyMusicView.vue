<template>
  <div class="page page-narrow">
    <header class="page-head">
      <h1 class="page-title display">Успокаивающая музыка</h1>
      <p class="page-subtitle">
        Готовые звуки природы и мелодии для расслабления — выберите и включите.
      </p>
    </header>

    <section class="card preselected-music-section">
      <div class="music-category">
        <h3 class="category-title"><Icon name="wind" :size="18" /> Звуки природы</h3>
        <ul class="track-list">
          <li v-for="sound in natureSounds" :key="sound.name" class="track-row">
            <button
              type="button"
              class="track-btn"
              :class="{ active: currentTrackUrl === sound.url }"
              @click="playTrack(sound)"
            >
              <span class="track-play-icon">
                <Icon :name="currentTrackUrl === sound.url ? 'pause' : 'play'" :size="16" />
              </span>
              <span class="track-name">{{ sound.name }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="music-category">
        <h3 class="category-title">
          <Icon name="music" :size="18" /> Музыкальные стили для терапии
        </h3>
        <ul class="track-list">
          <li v-for="style in musicStyles" :key="style.name" class="track-row">
            <button
              type="button"
              class="track-btn"
              :class="{ active: currentTrackUrl === style.url }"
              @click="playTrack(style)"
            >
              <span class="track-play-icon">
                <Icon :name="currentTrackUrl === style.url ? 'pause' : 'play'" :size="16" />
              </span>
              <span class="track-name">{{ style.name }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="currentTrackUrl" class="now-playing-card">
        <span class="medallion now-playing-icon"><Icon name="music" :size="20" /></span>
        <div class="now-playing-info">
          <span class="faint now-playing-label">Сейчас играет</span>
          <h4 class="now-playing-title">{{ currentTrackTitle }}</h4>
          <audio ref="audioPlayerRef" :src="currentTrackUrl" controls autoplay loop>
            Ваш браузер не поддерживает элемент audio.
          </audio>
        </div>
      </div>
      <div v-else class="empty-state no-track-selected">
        <span class="empty-icon"><Icon name="music" :size="28" /></span>
        <p>Выберите звук или мелодию для прослушивания.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import Icon from '@/components/Icon.vue';

interface Track {
  name: string;
  url: string;
  category: string;
}

const audioPlayerRef = ref<HTMLAudioElement | null>(null);
const currentTrackUrl = ref<string | null>(null);
const currentTrackTitle = ref<string | null>(null);

// Demonstration audio assets served from external CDNs. For a fully offline /
// self-hosted deployment, drop your own royalty-free files into
// frontend/public/audio/ and point these URLs at them (e.g. '/audio/rain.mp3').
const natureSounds = ref<Track[]>([
  {
    name: 'Шум дождя',
    url: 'https://www.soundjay.com/nature/sounds/rain-07.mp3',
    category: 'Звуки природы',
  },
  {
    name: 'Лесные звуки',
    url: 'https://www.soundjay.com/nature/sounds/forest-ambience-1.mp3',
    category: 'Звуки природы',
  },
  {
    name: 'Океанские волны',
    url: 'https://www.soundjay.com/nature/sounds/ocean-waves-crashing-01.mp3',
    category: 'Звуки природы',
  },
  {
    name: 'Треск костра',
    url: 'https://www.soundjay.com/nature/sounds/campfire-1.mp3',
    category: 'Звуки природы',
  },
  {
    name: 'Пение птиц',
    url: 'https://www.soundjay.com/nature/sounds/birds-singing-01.mp3',
    category: 'Звуки природы',
  },
  {
    name: 'Поток воды',
    url: 'https://www.soundjay.com/nature/sounds/water-flowing-01.mp3',
    category: 'Звуки природы',
  },
]);

const musicStyles = ref<Track[]>([
  {
    name: 'Lo-fi для релакса',
    url: 'https://www.chosic.com/wp-content/uploads/2021/07/The-Way-Home.mp3',
    category: 'Музыкальные стили',
  },
  {
    name: 'Эмбиент для концентрации',
    url: 'https://www.chosic.com/wp-content/uploads/2022/01/Floating-Abstract.mp3',
    category: 'Музыкальные стили',
  },
  {
    name: 'Классика для вдохновения',
    url: 'https://www.chosic.com/wp-content/uploads/2020/05/Puccini-Turandot-Nessun-Dorma-Instrumental.mp3',
    category: 'Музыкальные стили',
  },
]);

const playTrack = async (track: Track) => {
  currentTrackUrl.value = track.url;
  currentTrackTitle.value = track.name;
  await nextTick(); // Wait for the DOM to update so the audio element has the new src.
  if (audioPlayerRef.value) {
    audioPlayerRef.value.load();
    audioPlayerRef.value.play().catch((error) => {
      // Autoplay may be blocked by the browser until the user interacts.
      console.error('Ошибка воспроизведения:', error);
    });
  }
};
</script>

<style scoped>
.page-head {
  margin-bottom: var(--space-5);
}

.preselected-music-section {
  margin-bottom: var(--space-6);
}

.music-category {
  margin-bottom: var(--space-5);
}

.category-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary-color);
  font-size: var(--text-base);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-color);
}

.track-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.track-row {
  display: contents;
}

.track-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 16px 8px 8px;
  background: var(--bg-soft);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
}

.track-btn:hover:not(.active) {
  border-color: var(--border-strong);
  background: var(--hover-bg);
}

.track-play-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex-shrink: 0;
}

.track-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--on-primary);
}
.track-btn.active .track-play-icon {
  background: rgba(255, 255, 255, 0.22);
  color: var(--on-primary);
}

.now-playing-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  margin-top: var(--space-5);
  padding: var(--space-4);
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}

.now-playing-icon {
  flex-shrink: 0;
}

.now-playing-info {
  flex: 1;
  min-width: 0;
}
.now-playing-label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.now-playing-title {
  margin: var(--space-1) 0 var(--space-3);
  font-size: var(--text-base);
}
.now-playing-info audio {
  width: 100%;
}

.no-track-selected {
  margin-top: var(--space-5);
  padding: var(--space-6) var(--space-4);
}
</style>
