import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { analyzeCrisisRisk } from '../services/crisisService';

vi.mock('axios');

describe('crisis safety signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns high for an explicit high-risk keyword without an AI request', async () => {
    await expect(analyzeCrisisRisk('У меня есть суицидальные мысли')).resolves.toBe('high');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('returns unavailable rather than low when the AI screen fails', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('provider unavailable'));
    await expect(analyzeCrisisRisk('Мне сегодня очень тяжело')).resolves.toBe('unavailable');
  });

  it('returns unavailable for an unexpected AI response', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { choices: [{ message: { content: 'please seek help' } }] },
    } as never);
    await expect(analyzeCrisisRisk('Мне тревожно')).resolves.toBe('unavailable');
  });
});
