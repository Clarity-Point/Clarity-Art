import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';

it('does not follow external AI redirects for HTTP, streaming or classification', async () => {
  let original = 0;
  let redirected = 0;
  const receiver = createServer((_req, res) => {
    redirected++;
    res.end('{}');
  });
  const provider = createServer((_req, res) => {
    original++;
    res.writeHead(307, {
      Location: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/unexpected`,
    });
    res.end();
  });
  for (const server of [receiver, provider])
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    vi.resetModules();
    vi.stubEnv('AI_BASE_URL', `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`);
    vi.stubEnv('AI_DATA_PROCESSING_MODE', 'external');
    const { AIService } = await import('../../src/services/aiService');
    const { analyzeCrisisRisk } = await import('../../src/services/crisisService');
    await expect(AIService.generateText('Synthetic text')).rejects.toThrow();
    await expect(
      AIService.generateTextStream([{ role: 'user', content: 'Synthetic text' }]),
    ).rejects.toThrow();
    await expect(analyzeCrisisRisk('Synthetic text', true)).resolves.toBe('unavailable');
    expect(original).toBe(3);
    expect(redirected).toBe(0);
  } finally {
    vi.unstubAllEnvs();
    for (const server of [provider, receiver])
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
