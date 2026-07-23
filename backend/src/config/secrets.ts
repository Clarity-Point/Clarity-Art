// Centralised secret loading with fail-fast validation.
// Reading JWT_SECRET here (once, at startup) guarantees every module shares the
// same value and that the server refuses to boot with a missing or placeholder
// secret instead of silently falling back to an insecure default.

// Known insecure placeholders that must never be used as a real secret.
const PLACEHOLDER_SECRETS = ['your-secret-key', 'super-secret-key-123-change-me', 'change-me'];

function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || PLACEHOLDER_SECRETS.includes(secret)) {
    throw new Error(
      'JWT_SECRET is not configured. Set a strong, unique JWT_SECRET environment ' +
        'variable (placeholder values are rejected).',
    );
  }
  return secret;
}

export const JWT_SECRET = loadJwtSecret();
