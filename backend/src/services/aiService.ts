import axios from 'axios';
import prisma from '../config/prisma';
import { AI_BASE_URL, AI_MODEL, AI_VISION_MODEL, AI_ENABLED, aiHeaders } from '../config/ai';
import { createLogger } from '../config/logger';

const log = createLogger('aiService');

/** Token accounting returned by OpenRouter chat/completion responses. */
export interface AIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** A single chat message exchanged with the model. */
export interface ChatMessage {
  role: string;
  content: string;
}

// AI is optional. When no endpoint is configured (no key and no local base URL)
// we run in a graceful "assistant unavailable" mode: every AI feature returns a
// calm, supportive canned reply instead of throwing a 500, so the product stays
// fully usable offline with zero configuration. Point AI_BASE_URL at a local
// server (e.g. Ollama) or set AI_API_KEY to switch to real model calls — no
// other change needed.
const FALLBACK_REPLY =
  'Сейчас ИИ-ассистент недоступен (не настроен AI-провайдер), поэтому я отвечаю ' +
  'заготовленным сообщением. Я рядом и слышу вас. Попробуйте описать, что чувствуете ' +
  'прямо сейчас, или сделайте несколько спокойных вдохов. Если вам тяжело — вы можете ' +
  'обратиться за поддержкой к специалисту.';

const FALLBACK_IMAGE_ANALYSIS =
  'ИИ-анализ изображений сейчас недоступен (не настроен AI-провайдер). ' +
  'Когда администратор настроит модель, здесь появится подробный разбор вашего рисунка: ' +
  'цвета, композиция и возможные эмоциональные темы.';

export class AIService {
  /** Whether real model calls are available (an OpenRouter key is configured). */
  static get isConfigured(): boolean {
    return AI_ENABLED;
  }

  static async generateText(prompt: string): Promise<{ content: string; usage: AIUsage | null }> {
    if (!AI_ENABLED) {
      return { content: FALLBACK_REPLY, usage: null };
    }
    try {
      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        {
          model: AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: aiHeaders({
            'HTTP-Referer': 'https://tochka-yasnosti.ru',
            'X-Title': 'Tochka Yasnosti',
          }),
        },
      );
      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
      };
    } catch (error: unknown) {
      const detail = axios.isAxiosError(error)
        ? (error.response?.data ?? error.message)
        : String(error);
      log.error({ err: detail }, 'AIService generateText error');
      throw new Error('Failed to generate text from AI via OpenRouter');
    }
  }
  static async extractTags(text: string, allowProvider = true): Promise<string[]> {
    if (!AI_ENABLED || !allowProvider) {
      // Lightweight keyword heuristic so diary/chat entries still get useful tags.
      const dict: Record<string, string> = {
        трев: 'Тревога',
        страх: 'Тревога',
        паник: 'Тревога',
        сон: 'Сон',
        спал: 'Сон',
        уста: 'Усталость',
        выгор: 'Выгорание',
        работ: 'Работа',
        учеб: 'Учеба',
        семь: 'Семья',
        отношен: 'Отношения',
        груст: 'Грусть',
        депресс: 'Настроение',
        радост: 'Радость',
        зл: 'Гнев',
      };
      const low = text.toLowerCase();
      const found = new Set<string>();
      for (const [k, v] of Object.entries(dict)) if (low.includes(k)) found.add(v);
      return found.size ? [...found] : ['Общее'];
    }
    try {
      const prompt = `Анализируй следующий текст и выдели 3-5 ключевых психологических тем (тегов) через запятую.
    Примеры: Выгорание, Отношения, Сон, Тревога, Семья, Учеба.
    Текст: "${text}"
    Теги:`;

      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        {
          model: AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: aiHeaders(),
        },
      );
      const tagsString = response.data.choices[0].message.content;
      return tagsString.split(',').map((t: string) => t.trim().replace('.', ''));
    } catch (e) {
      log.error({ err: e }, 'Failed to extract tags');
      return ['General'];
    }
  }

  static async getContextualPrompt(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) return '';

    const { sleepHours, stepsCount } = user.profile;

    let context = `Контекст пользователя: сегодня спал ${sleepHours || '?'}ч, прошел ${stepsCount || '?'} шагов. `;
    if (sleepHours && sleepHours < 6)
      context += 'Пользователь может быть раздражительным из-за недосыпа. ';
    if (stepsCount && stepsCount < 3000) context += 'Мало физической активности сегодня. ';

    return context;
  }

  static async generateTextStream(
    messages: ChatMessage[],
    _userId?: string,
  ): Promise<ReadableStream<Uint8Array>> {
    if (!AI_ENABLED) {
      // Emit the fallback reply as OpenRouter-style SSE chunks so the streaming
      // controller consumes it exactly like a real response.
      const words = FALLBACK_REPLY.split(' ');
      return new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          for (const w of words) {
            const payload = { choices: [{ delta: { content: w + ' ' } }] };
            controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
    }
    try {
      const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: aiHeaders({
          'HTTP-Referer': 'https://tochka-yasnosti.ru',
          'X-Title': 'Tochka Yasnosti',
        }),
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter streaming error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('OpenRouter streaming error: empty response body');
      }

      return response.body;
    } catch (error: unknown) {
      log.error(
        { err: error instanceof Error ? error.message : String(error) },
        'AIService generateTextStream error',
      );
      throw new Error('Failed to start AI stream');
    }
  }

  static async analyzeImage(
    prompt: string,
    mimeType: string,
    base64Data: string,
  ): Promise<{ content: string; usage: AIUsage | null }> {
    if (!AI_ENABLED) {
      return { content: FALLBACK_IMAGE_ANALYSIS, usage: null };
    }
    // Image analysis uses a vision-capable model on the same endpoint.
    try {
      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        {
          model: AI_VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                  },
                },
              ],
            },
          ],
        },
        {
          headers: aiHeaders(),
        },
      );
      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
      };
    } catch (error: unknown) {
      const detail = axios.isAxiosError(error)
        ? (error.response?.data ?? error.message)
        : String(error);
      log.error({ err: detail }, 'AIService analyzeImage error');
      throw new Error('Failed to analyze image with AI via OpenRouter');
    }
  }
}
