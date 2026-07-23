<template>
  <div class="chat-shell">
    <!-- Sessions / history -->
    <aside class="sessions-pane">
      <div class="sessions-head">
        <h3 class="sessions-title">История чатов</h3>
        <button type="button" class="btn-primary btn-sm new-chat-btn" @click="clearSession">
          <Icon name="plus" :size="16" />
          Новый чат
        </button>
      </div>

      <div v-if="sessions.length === 0" class="sessions-empty muted">
        Пока нет сохранённых бесед — начните разговор, и он появится здесь.
      </div>

      <div v-else class="sessions-list">
        <button
          v-for="session in sessions"
          :key="session.id"
          type="button"
          class="session-tab"
          :class="{ active: currentSessionId === session.id }"
          @click="selectSession(session.id)"
        >
          <span class="session-tab-icon"><Icon name="message-circle" :size="16" /></span>
          <span class="session-tab-body">
            <span class="session-tab-title">{{ session.title || 'Новый чат' }}</span>
            <small class="session-tab-date">{{ formatSessionDate(session.date) }}</small>
          </span>
        </button>
      </div>
    </aside>

    <!-- Conversation -->
    <section class="chat-pane">
      <div class="messages" ref="messagesRef">
        <div v-if="messages.length === 0" class="empty-state chat-empty">
          <span class="empty-icon"><Icon name="leaf" :size="28" /></span>
          <p>Расскажите, что вас беспокоит…</p>
          <p class="chat-empty-hint muted">
            Ассистент рядом, чтобы выслушать и помочь найти опору.
          </p>
        </div>

        <div
          v-for="(message, index) in messages"
          :key="index"
          class="message-row"
          :class="message.sender === 'user' ? 'is-user' : 'is-ai'"
        >
          <span v-if="message.sender === 'ИИ'" class="msg-avatar" aria-hidden="true">
            <Icon name="leaf" :size="16" />
          </span>

          <div class="message-item">
            <div class="message-meta">
              <span class="message-author">{{ message.sender === 'user' ? 'Вы' : 'ИИ' }}</span>
              <span v-if="message.timestamp" class="message-time">{{
                formatMessageTime(message.timestamp)
              }}</span>
            </div>
            <div class="message-body">
              <VueMarkdown v-if="message.sender === 'ИИ'" :source="message.text" />
              <span v-else>{{ message.text }}</span>
            </div>
          </div>
        </div>

        <div v-if="isStreaming" class="streaming-indicator">
          <span class="msg-avatar" aria-hidden="true"><Icon name="leaf" :size="16" /></span>
          ИИ печатает…
        </div>
      </div>

      <EmergencyModal :show="showEmergency" @close="showEmergency = false" />

      <form class="input-area" @submit.prevent="sendMessage">
        <input
          type="text"
          v-model="newMessage"
          @keyup.enter="sendMessage"
          :disabled="isStreaming"
          placeholder="Введите сообщение…"
          aria-label="Сообщение ассистенту"
        />
        <button
          type="submit"
          class="icon-btn send-btn"
          :disabled="isStreaming || !newMessage.trim()"
          aria-label="Отправить сообщение"
        >
          <Icon name="send" :size="18" />
        </button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import VueMarkdown from 'vue-markdown-render';
import EmergencyModal from './EmergencyModal.vue';
import Icon from '@/components/Icon.vue';
import { useChat } from '@/composables/useChat';

const {
  newMessage,
  messages,
  sessions,
  currentSessionId,
  showEmergency,
  isStreaming,
  formatSessionDate,
  formatMessageTime,
  fetchSessions,
  selectSession,
  sendMessage,
  clearSession,
} = useChat();

onMounted(async () => {
  await fetchSessions();
});
</script>

<style scoped>
.chat-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--space-5);
  height: 72vh;
  min-height: 520px;
}

/* -------------------------------------------------- Sessions pane */

.sessions-pane {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.sessions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.sessions-title {
  font-size: var(--text-base);
  margin: 0;
}

.new-chat-btn {
  flex-shrink: 0;
}

.sessions-empty {
  font-size: var(--text-sm);
  line-height: 1.6;
  padding: var(--space-3) 0;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-y: auto;
  min-height: 0;
}

.session-tab {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color);
  font-weight: 400;
  cursor: pointer;
}

.session-tab:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: transparent;
}

.session-tab.active {
  background: var(--primary-soft);
  border-color: var(--primary-color);
}

.session-tab-icon {
  color: var(--muted-text);
  margin-top: 2px;
  flex-shrink: 0;
}

.session-tab.active .session-tab-icon {
  color: var(--primary-color);
}

.session-tab-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.session-tab-title {
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-tab-date {
  color: var(--muted-text);
  font-size: var(--text-xs);
  margin-top: 2px;
}

/* -------------------------------------------------- Chat pane */

.chat-pane {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
}

.messages {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.chat-empty {
  margin: auto;
  max-width: 40ch;
}

.chat-empty-hint {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}

.message-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  max-width: 80%;
}

.message-row.is-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-row.is-ai {
  align-self: flex-start;
}

.msg-avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-soft);
  color: var(--primary-color);
}

.message-item {
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  line-height: 1.6;
}

.is-user .message-item {
  background: var(--primary-soft);
  border: 1px solid var(--primary-soft);
  border-bottom-right-radius: var(--radius-sm);
}

.is-ai .message-item {
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: var(--radius-sm);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 2px;
}

.message-author {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted-text);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.message-time {
  font-size: var(--text-xs);
  color: var(--faint-text);
}

.message-body {
  color: var(--text-color);
  word-break: break-word;
}

.message-body :deep(p:last-child) {
  margin-bottom: 0;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--muted-text);
  font-style: italic;
}

/* -------------------------------------------------- Composer */

.input-area {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding: var(--space-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--elevated-bg);
}

.input-area input {
  flex-grow: 1;
  border: none;
  background: transparent;
  padding: 10px var(--space-3);
  border-radius: 0;
}

.input-area input:focus {
  box-shadow: none;
}

.send-btn {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-full);
  background: var(--primary-color);
  color: var(--on-primary);
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-hover);
  color: var(--on-primary);
}

.send-btn:disabled {
  background: var(--border-strong);
  color: var(--card-bg);
}

/* -------------------------------------------------- Responsive */

@media (max-width: 900px) {
  .chat-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: auto;
    min-height: 0;
  }

  .sessions-pane {
    max-height: 220px;
  }

  .sessions-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: var(--space-1);
  }

  .session-tab {
    width: auto;
    min-width: 180px;
    flex-shrink: 0;
  }

  .chat-pane {
    min-height: 60vh;
  }

  .message-row {
    max-width: 92%;
  }
}
</style>
