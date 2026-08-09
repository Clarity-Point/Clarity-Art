import { ref } from 'vue';
import axios from 'axios';

export interface ChatMessage {
  text: string;
  sender: 'user' | 'ИИ';
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  title?: string;
  date: string;
}

interface ChatHistoryItem {
  content: string;
  role: string;
  createdAt: string;
}

interface ChatStreamData {
  content?: string;
  sessionId?: string;
  riskLevel?: string;
  error?: string;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Chat state and behaviour for ChatComponent: session history, SSE streaming
 * of AI replies and emergency escalation. Extracted verbatim from the
 * component — same endpoints, same reactive shape, same side-effects.
 */
export function useChat() {
  const newMessage = ref('');
  const messages = ref<ChatMessage[]>([]);
  const sessions = ref<ChatSession[]>([]);
  const currentSessionId = ref<string | null>(null);
  const showEmergency = ref(false);
  const isStreaming = ref(false);

  // View-only helper: friendly date for the history list.
  const formatSessionDate = (date: string) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  // View-only helper: short time for message timestamps.
  const formatMessageTime = (timestamp: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API_URL}/ai/sessions`);
      sessions.value = response.data;
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    }
  };

  const selectSession = async (id: string) => {
    currentSessionId.value = id;
    try {
      const response = await axios.get(`${API_URL}/ai/history/${id}`);
      messages.value = response.data.map((m: ChatHistoryItem) => ({
        text: m.content,
        sender: m.role === 'assistant' ? 'ИИ' : 'user',
        timestamp: m.createdAt,
      }));
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  const sendMessage = async () => {
    if (newMessage.value.trim() === '' || isStreaming.value) return;

    const userMessageText = newMessage.value;
    messages.value.push({
      text: userMessageText,
      sender: 'user',
      timestamp: new Date().toISOString(),
    });
    newMessage.value = '';
    isStreaming.value = true;

    // Placeholder for AI reply
    const aiMessageIndex =
      messages.value.push({ text: '', sender: 'ИИ', timestamp: new Date().toISOString() }) - 1;

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessageText, sessionId: currentSessionId.value }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
          throw new Error('Session expired');
        }
        const payload = await response.json().catch(() => ({}));
        if (response.status === 412 && payload.code === 'AI_CONSENT_REQUIRED') {
          throw new Error('AI_CONSENT_REQUIRED');
        }
        throw new Error(payload.error || `Chat request failed with status ${response.status}`);
      }
      if (!response.body) throw new Error('No body in response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processEvent = (event: string) => {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const data: ChatStreamData = JSON.parse(dataStr);
            if (data.content) messages.value[aiMessageIndex].text += data.content;
            if (data.sessionId) currentSessionId.value = data.sessionId;
            if (data.riskLevel === 'high') showEmergency.value = true;
            if (data.error) messages.value[aiMessageIndex].text = 'Не удалось получить ответ.';
          } catch {
            // A malformed provider event is ignored without discarding the rest.
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        events.forEach(processEvent);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processEvent(buffer);
      await fetchSessions(); // Refresh sessions list
    } catch (error) {
      console.error('Error sending message:', error);
      messages.value[aiMessageIndex].text =
        error instanceof Error && error.message === 'AI_CONSENT_REQUIRED'
          ? 'Для внешнего AI-провайдера нужно ваше согласие. Откройте «Профиль → Терапевт и данные».'
          : 'Не удалось получить ответ. Проверьте соединение и попробуйте ещё раз.';
    } finally {
      isStreaming.value = false;
    }
  };

  const clearSession = () => {
    messages.value = [];
    currentSessionId.value = null;
  };

  return {
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
  };
}
