import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it.each([
  { url: '', enabled: true, consent: true },
  { url: 'https://openrouter.ai./api/v1', enabled: true, consent: true },
  { url: 'http://ollama:11434/v1', enabled: true, consent: false },
  { url: 'invalid-url', enabled: false, consent: false },
])(
  'derives consent and availability from the AI endpoint ($url)',
  async ({ url, enabled, consent }) => {
    vi.resetModules();
    vi.stubEnv('AI_BASE_URL', url);
    vi.stubEnv('AI_DATA_PROCESSING_MODE', 'local');
    vi.stubEnv('AI_API_KEY', 'test-config-key');
    const settings = await import('../../src/config/ai');
    expect(settings.AI_ENABLED).toBe(enabled);
    expect(settings.AI_REQUIRES_CONSENT).toBe(consent);
  },
);
