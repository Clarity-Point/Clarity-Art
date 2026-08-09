<template>
  <div class="peer-support card">
    <div class="row header-row">
      <span class="medallion"><Icon name="users" :size="22" /></span>
      <div>
        <h3>Поддержка коллег</h3>
        <p class="subtitle">Анонимные слова поддержки и маленькие победы</p>
      </div>
    </div>

    <div class="post-box">
      <textarea
        v-model="newMessage"
        placeholder="Поделитесь словами поддержки или своим успехом..."
        rows="2"
        aria-label="Новое анонимное сообщение"
      ></textarea>
      <button @click="postMessage" :disabled="!newMessage.trim() || isSending" class="btn-primary">
        <Icon name="send" :size="16" />
        {{ isSending ? 'Отправляем…' : 'Отправить' }}
      </button>
    </div>

    <div v-if="messages.length" class="messages-list">
      <div v-for="msg in messages" :key="msg.id" class="support-card">
        <div class="support-card-head">
          <span class="author"><Icon name="heart" :size="13" /> {{ msg.authorTitle }}</span>
          <span class="date">{{ new Date(msg.createdAt).toLocaleDateString() }}</span>
        </div>
        <p class="content">{{ msg.content }}</p>
      </div>
    </div>
    <div v-else class="empty-state">
      <span class="empty-icon"><Icon name="users" :size="28" /></span>
      <p>Пока никто не оставил сообщение. Будьте первым, кто поддержит коллегу.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import Icon from '@/components/Icon.vue';
import { useToastStore } from '@/stores/toastStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const toastStore = useToastStore();

interface PeerMessage {
  id: string;
  authorTitle: string;
  createdAt: string;
  content: string;
}

const messages = ref<PeerMessage[]>([]);
const newMessage = ref('');
const isSending = ref(false);

const fetchMessages = async () => {
  try {
    const response = await axios.get(`${API_URL}/org/peer-support`);
    messages.value = response.data;
  } catch (e) {
    console.error(e);
  }
};

const postMessage = async () => {
  if (!newMessage.value.trim() || isSending.value) return;
  isSending.value = true;
  try {
    await axios.post(`${API_URL}/org/peer-support`, { content: newMessage.value.trim() });
    newMessage.value = '';
    await fetchMessages();
    toastStore.success('Сообщение поддержки опубликовано анонимно.');
  } catch {
    toastStore.error('Не удалось отправить сообщение. Текст оставлен в форме.');
  } finally {
    isSending.value = false;
  }
};

onMounted(fetchMessages);
</script>

<style scoped>
.peer-support {
  display: flex;
  flex-direction: column;
}

.header-row {
  align-items: center;
  margin-bottom: var(--space-5);
}

.header-row h3 {
  margin: 0 0 2px;
}

.subtitle {
  margin: 0;
  color: var(--muted-text);
  font-size: var(--text-sm);
}

.post-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.post-box textarea {
  resize: none;
}

.post-box button {
  align-self: flex-end;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 400px;
  overflow-y: auto;
  padding-right: var(--space-1);
}

.support-card {
  background: var(--primary-soft);
  border-left: 3px solid var(--primary-color);
  padding: var(--space-4);
}

.support-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.author {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: 600;
  font-size: var(--text-xs);
  color: var(--primary-color);
}

.content {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-color);
  line-height: 1.5;
}

.date {
  font-size: var(--text-xs);
  color: var(--faint-text);
  white-space: nowrap;
}
</style>
