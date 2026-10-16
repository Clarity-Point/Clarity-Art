// Centralised secret loading with fail-fast validation.
// Reading JWT_SECRET here (once, at startup) guarantees every module shares the
// same value and that the server refuses to boot with a missing or placeholder
// secret instead of silently falling back to an insecure default.

// Known insecure placeholders that must never be used as a real secret.
const PLACEHOLDER_SECRETS = ['your-secret-key', 'super-secret-key-123-change-me', 'change-me'];
const MIN_SECRET_BYTES = 32;

export function validateJwtSecret(secret: string | undefined): string {
  if (
    !secret ||
    secret !== secret.trim() ||
    Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES ||
    PLACEHOLDER_SECRETS.includes(secret)
  ) {
    throw new Error(
      `JWT_SECRET must be a unique secret of at least ${MIN_SECRET_BYTES} bytes. ` +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return secret;
}

function loadJwtSecret(): string {
  return validateJwtSecret(process.env.JWT_SECRET);
}

export const JWT_SECRET = loadJwtSecret();
