import { describe, expect, it } from 'vitest';
import { validateJwtSecret } from '../config/secrets';

describe('JWT secret validation', () => {
  it.each([undefined, '', 'short-secret', 'change-me', ` ${'x'.repeat(32)}`])(
    'rejects missing, weak, placeholder or padded value %j',
    (secret) => {
      expect(() => validateJwtSecret(secret)).toThrow(/at least 32 bytes/);
    },
  );

  it('accepts a generated-strength secret', () => {
    const secret = '0123456789abcdef'.repeat(4);
    expect(validateJwtSecret(secret)).toBe(secret);
  });
});
