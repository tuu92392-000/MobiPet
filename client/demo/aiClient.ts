// Browser-only demo: no AI calls and no API key. Every AI feature uses the pre-written templates,
// exactly as the full app does in Template mode. Replaces server/ai/client.ts.
export const MODEL = 'template-only';

export function aiMode(): 'ai' | 'template' {
  return 'template';
}

export class AIUnavailable extends Error {}

export async function complete(_options: unknown): Promise<string> {
  throw new AIUnavailable('demo-template-only');
}
