import { describe, expect, it } from 'vitest';
import { validateImageInput, validateTextInput } from '../security/inputValidation';

describe('input validation', () => {
  it('accepts a non-empty bounded text input', () => {
    expect(validateTextInput('бережный текст', 20)).toEqual({ ok: true, value: 'бережный текст' });
  });

  it('rejects empty and oversized text input', () => {
    expect(validateTextInput('   ', 20)).toMatchObject({ ok: false });
    expect(validateTextInput('слишком длинный текст', 5)).toMatchObject({ ok: false });
  });

  it('accepts a supported image MIME type within the byte limit', () => {
    expect(validateImageInput('image/png', 'iVBORw0KGgo=', 10)).toEqual({ ok: true });
  });

  it('rejects unsupported MIME type and oversized image data', () => {
    expect(validateImageInput('image/svg+xml', 'aGVsbG8=', 10)).toMatchObject({ ok: false });
    expect(validateImageInput('image/png', 'a'.repeat(100), 10)).toMatchObject({ ok: false });
    expect(validateImageInput('image/png', 'aGVsbG8=', 10)).toMatchObject({ ok: false });
  });
});
