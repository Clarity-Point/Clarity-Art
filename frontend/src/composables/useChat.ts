import { ref, onScopeDispose } from 'vue';
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
  const isLoadingSessions = ref(false);
  const isLoadingHistory = ref(false);
  const historyError = ref('');

  /*
   * Guards against a slow history request for one session landing after the
   * user has already switched to another. Without it, clicking two sessions
   * quickly leaves the transcript of whichever answered last on screen while
   * the sidebar highlights a different one.
   */
  let historyRequestId = 0;

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
    isLoadingSessions.value = true;
    try {
      const response = await axios.get(`${API_URL}/ai/sessions`);
      sessions.value = Array.isArray(response.data) ? response.data : [];
    } catch (e) {
      console.error('Failed to fetch sessions', e);
      sessions.value = [];
    } finally {
      isLoadingSessions.value = false;
    }
  };

  const selectSession = async (id: string) => {
    const requestId = ++historyRequestId;
    currentSessionId.value = id;
    isLoadingHistory.value = true;
    historyError.value = '';
    try {
      const response = await axios.get(`${API_URL}/ai/history/${id}`);
      // A newer selection has already been made; this response is stale.
      if (requestId !== historyRequestId) return;
      messages.value = (Array.isArray(response.data) ? response.data : []).map(
        (m: ChatHistoryItem) => ({
          text: m.content,
          sender: m.role === 'assistant' ? 'ИИ' : 'user',
          timestamp: m.createdAt,
        }),
      );
    } catch (e) {
      if (requestId !== historyRequestId) return;
      console.error('Failed to fetch history', e);
      messages.value = [];
      historyError.value = 'Не удалось загрузить историю беседы. Попробуйте ещё раз.';
    } finally {
      if (requestId === historyRequestId) isLoadingHistory.value = false;
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
    historyError.value = '';

    // Placeholder for AI reply
    const aiMessageIndex =
      messages.value.push({ text: '', sender: 'ИИ', timestamp: new Date().toISOString() }) - 1;

    /*
     * Aborted when the component is torn down mid-stream. Without it the read
     * loop keeps running against a view that no longer exists: the socket stays
     * open, every chunk still triggers a reactive write, and a user who quickly
     * leaves the page pays for the full generation.
     */
    const controller = new AbortController();
    let disposed = false;
    const stop = () => {
      disposed = true;
      controller.abort();
    };
    onScopeDispose(stop);

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessageText, sessionId: currentSessionId.value }),
        signal: controller.signal,
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
            if (data.content && !disposed) messages.value[aiMessageIndex].text += data.content;
            if (data.sessionId) currentSessionId.value = data.sessionId;
            if (data.riskLevel === 'high') showEmergency.value = true;
            if (data.error && !disposed) {
              messages.value[aiMessageIndex].text = 'Не удалось получить ответ.';
            }
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
      if (disposed) return;
      console.error('Error sending message:', error);
      messages.value[aiMessageIndex].text =
        error instanceof Error && error.message === 'AI_CONSENT_REQUIRED'
          ? 'Для внешнего AI-провайдера нужно ваше согласие. Откройте «Профиль → Терапевт и данные».'
          : 'Не удалось получить ответ. Проверьте соединение и попробуйте ещё раз.';
    } finally {
      // Only clear the flag if this request still owns it: an aborted stream
      // must not unlock the input box of whatever replaced it.
      if (!disposed) isStreaming.value = false;
    }
  };

  const clearSession = () => {
    // Invalidate any in-flight history load so it cannot repopulate the pane
    // after the user has deliberately cleared it.
    historyRequestId += 1;
    messages.value = [];
    currentSessionId.value = null;
    historyError.value = '';
    isLoadingHistory.value = false;
  };

  return {
    newMessage,
    messages,
    sessions,
    currentSessionId,
    showEmergency,
    isStreaming,
    isLoadingSessions,
    isLoadingHistory,
    historyError,
    formatSessionDate,
    formatMessageTime,
    fetchSessions,
    selectSession,
    sendMessage,
    clearSession,
  };
}
