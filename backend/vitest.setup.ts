// Test environment bootstrap. Runs before any test module is imported, so
// config/secrets.ts sees a valid (non-placeholder) JWT_SECRET and does not
// fail-fast during import.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-a-placeholder';
// Enable the real (mocked) AI code path.
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-openrouter-key';
