import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import axios from 'axios';
import { useChat } from './useChat';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pendingFetch() {
  let signal: AbortSignal;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        }),
      );
    }),
  );
  return () => signal;
}

describe('chat stream lifecycle', () => {
  it('aborts a send started by a click outside setup when the component is disposed', async () => {
    const signal = pendingFetch();
    const scope = effectScope();
    const chat = scope.run(useChat)!;
    chat.newMessage.value = 'Private message';
    const sending = chat.sendMessage();
    scope.stop();
    expect(signal().aborted).toBe(true);
    await sending;
    expect(chat.messages.value[1].text).toBe('');
  });

  it('does not put a cancelled reply into a newly selected conversation', async () => {
    const signal = pendingFetch();
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [{ content: 'Other conversation', role: 'user' }],
    });
    const scope = effectScope();
    const chat = scope.run(useChat)!;
    chat.newMessage.value = 'Original message';
    const sending = chat.sendMessage();
    await chat.selectSession('other');
    await sending;
    expect(signal().aborted).toBe(true);
    expect(chat.currentSessionId.value).toBe('other');
    expect(chat.messages.value.map((message) => message.text)).toEqual(['Other conversation']);
    scope.stop();
  });

  it('reassembles split SSE events and keeps text available after a failed send', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [] });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const part of ['data: {"cont', 'ent":"Привет"}\n\ndata: {"sessionId":"saved"}\n\n'])
          controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, body: stream })
        .mockRejectedValueOnce(new Error('Connection failed')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const scope = effectScope();
    const chat = scope.run(useChat)!;
    chat.newMessage.value = 'Hello';
    await chat.sendMessage();
    expect(chat.messages.value[1].text).toBe('Привет');
    expect(chat.currentSessionId.value).toBe('saved');
    chat.newMessage.value = 'Keep this draft';
    await chat.sendMessage();
    expect(chat.newMessage.value).toBe('Keep this draft');
    expect(chat.isStreaming.value).toBe(false);
    scope.stop();
  });
});
