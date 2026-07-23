<template>
  <div class="page chat-page">
    <header class="chat-page-head">
      <h1 class="page-title display">Чат с ассистентом</h1>
      <p class="page-subtitle">
        Здесь вы можете спокойно поговорить о том, что вас беспокоит, и вместе с ассистентом найти
        бережные арт-практики и первые шаги самоподдержки.
      </p>
    </header>
    <ChatComponent />
  </div>
</template>

<script setup lang="ts">
import ChatComponent from '@/components/ChatComponent.vue';
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--header-h));
}

.chat-page-head {
  margin-bottom: var(--space-5);
}

.page-subtitle {
  margin-bottom: 0;
}

:deep(.chat-shell) {
  flex-grow: 1;
}
</style>
