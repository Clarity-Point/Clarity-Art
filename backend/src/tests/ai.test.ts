import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../services/aiService';
import axios, { AxiosResponse } from 'axios';

vi.mock('axios');

describe('AIService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate text and return content plus usage', async () => {
    // OpenRouter-style chat completion response shape.
    const mockResponse = {
      data: {
        choices: [{ message: { content: 'Hello from AI' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      },
    };
    vi.mocked(axios.post).mockResolvedValue(mockResponse as unknown as AxiosResponse);

    const result = await AIService.generateText('Hi');
    expect(result.content).toBe('Hello from AI');
    expect(result.usage).toEqual({ prompt_tokens: 3, completion_tokens: 4 });
    expect(axios.post).toHaveBeenCalled();
  });

  it('should throw a generic error when the AI request fails', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('API Error'));

    await expect(AIService.generateText('Hi')).rejects.toThrow(
      'Failed to generate text from AI via OpenRouter',
    );
  });
});
