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
  // Base64 stores every three raw bytes in four characters. The conservative
  // length check rejects inputs larger than the configured raw-byte budget.
  const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
  if (estimatedBytes > maxBytes) return { ok: false, error: 'Image exceeds size limit' };
  return { ok: true };
}
