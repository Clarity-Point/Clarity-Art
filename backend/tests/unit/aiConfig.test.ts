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

it('changes policy for provider, model or operator revision and requires public policy metadata', async () => {
  async function policy({
    url = 'https://provider.example.test/v1',
    revision = 'r1',
    model = 'model-a',
    label = 'Provider A',
  } = {}) {
    vi.resetModules();
    vi.stubEnv('AI_DATA_PROCESSING_MODE', 'external');
    vi.stubEnv('AI_BASE_URL', url);
    vi.stubEnv('AI_PROVIDER_LABEL', label);
    vi.stubEnv('AI_PROVIDER_POLICY_REVISION', revision);
    vi.stubEnv('AI_MODEL', model);
    return (await import('../../src/config/ai')).AI_CONSENT_POLICY;
  }
  const first = await policy();
  expect(first?.id).toHaveLength(64);
  expect(await policy({ url: 'https://provider.example.test/v1/' })).toEqual(first);
  expect((await policy({ url: 'https://provider-b.example.test/v1' }))?.id).not.toBe(first?.id);
  expect((await policy({ model: 'model-b' }))?.id).not.toBe(first?.id);
  expect((await policy({ revision: 'r2' }))?.id).not.toBe(first?.id);
  expect(await policy({ revision: '' })).toBeNull();
  expect(await policy({ label: '' })).toBeNull();
});
