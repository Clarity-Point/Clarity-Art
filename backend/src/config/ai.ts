// Provider-agnostic AI configuration.
//
// The chat, image-analysis, tagging and crisis-detection features all speak the
// OpenAI-compatible `POST /chat/completions` protocol. That means they work with
// ANY such endpoint and are not tied to a specific vendor:
//
//   • Fully local / offline:  Ollama, LM Studio, llama.cpp server, vLLM, LocalAI
//   • Hosted gateways:        OpenRouter, OpenAI, Together, Groq, ...
//
// Configure via env (see backend/.env.example):
//   AI_BASE_URL      base URL of an OpenAI-compatible API (default: OpenRouter)
//   AI_MODEL         text model id understood by that endpoint
//   AI_VISION_MODEL  model id used for image analysis (defaults to AI_MODEL)
//   AI_API_KEY       API key — optional for local servers that need none
//
// For backward compatibility, OPENROUTER_API_KEY is still accepted as the key.

export const AI_BASE_URL = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';

export const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o-mini';

export const AI_VISION_MODEL = process.env.AI_VISION_MODEL || AI_MODEL;

export const AI_API_KEY = (process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();

export const AI_DATA_PROCESSING_MODE =
  process.env.AI_DATA_PROCESSING_MODE === 'local' ? 'local' : 'external';

// AI is "enabled" when there is somewhere to send requests: either a key is set
// (hosted providers) or a custom base URL is configured (a local server that
// needs no key). Otherwise the app runs in a graceful, canned-fallback mode so
// it stays fully usable offline with zero configuration.
export const AI_ENABLED = !!(AI_API_KEY || process.env.AI_BASE_URL);

// External providers may receive diary, chat, profile and image content only
// after the user has explicitly opted in. Local/offline inference needs no such
// transfer consent because data stays inside the deployment.
export const AI_REQUIRES_CONSENT = AI_ENABLED && AI_DATA_PROCESSING_MODE === 'external';

/**
 * Headers for an OpenAI-compatible request. The Authorization header is only
 * attached when a key is present, so keyless local servers (e.g. Ollama) are
 * not rejected.
 */
export function aiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (AI_API_KEY) headers.Authorization = `Bearer ${AI_API_KEY}`;
  return headers;
}
