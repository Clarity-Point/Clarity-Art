export type TextValidationResult = { ok: true; value: string } | { ok: false; error: string };

export type BasicValidationResult = { ok: true } | { ok: false; error: string };

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateTextInput(value: unknown, maxLength: number): TextValidationResult {
  if (typeof value !== 'string') return { ok: false, error: 'Text must be a string' };
  const normalized = value.trim();
  if (!normalized) return { ok: false, error: 'Text must not be empty' };
  if (normalized.length > maxLength)
    return { ok: false, error: `Text exceeds ${maxLength} characters` };
  return { ok: true, value: normalized };
}

export function validateImageInput(
  mimeType: unknown,
  base64Data: unknown,
  maxBytes: number,
): BasicValidationResult {
  if (typeof mimeType !== 'string' || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: 'Unsupported image type' };
  }
  if (typeof base64Data !== 'string' || !base64Data) {
    return { ok: false, error: 'Image data is required' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) {
    return { ok: false, error: 'Image data is not valid base64' };
  }
  // Base64 stores every three raw bytes in four characters. The conservative
  // length check rejects inputs larger than the configured raw-byte budget.
  const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
  if (estimatedBytes > maxBytes) return { ok: false, error: 'Image exceeds size limit' };
  const bytes = Buffer.from(base64Data.slice(0, 24), 'base64');
  const signatures: Record<string, (buffer: Buffer) => boolean> = {
    'image/jpeg': (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/webp': (buffer) =>
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
  };
  if (!signatures[mimeType](bytes))
    return { ok: false, error: 'Image content does not match type' };
  return { ok: true };
}
