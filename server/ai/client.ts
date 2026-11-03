// Thin wrapper around the Anthropic SDK. All AI calls go through the server so the key never reaches the browser.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey, timeout: 8_000, maxRetries: 1 }) : null;

export function aiMode(): 'ai' | 'template' {
  return client ? 'ai' : 'template';
}

/** Any reason the AI could not produce a usable answer. Callers fall back to templates. */
export class AIUnavailable extends Error {}

interface CompleteOptions {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  /** JSON schema for structured output (unit summary, message filter). */
  schema?: Record<string, unknown>;
}

export async function complete({ system, messages, schema }: CompleteOptions): Promise<string> {
  if (!client) throw new AIUnavailable('no-api-key');
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      // Replies are capped to two sentences by the prompt and trimmed afterward;
      // this ceiling leaves room for thinking so replies are never cut mid-sentence.
      max_tokens: 1024,
      system,
      messages,
      output_config: { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      // If the model declines, the API retries on a fallback model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new AIUnavailable(`api-${e.status ?? 'error'}`);
    throw new AIUnavailable(e instanceof Error ? e.name : 'unknown');
  }
  if (res.stop_reason === 'refusal') throw new AIUnavailable('refusal');
  if (res.stop_reason === 'max_tokens') throw new AIUnavailable('max-tokens');
  const text = res.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
  if (!text) throw new AIUnavailable('empty');
  return text;
}
