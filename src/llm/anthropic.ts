import { ChatOptions, ChatProvider, ProviderError } from './provider.js';

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  concurrency?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

/** Direct Messages API via fetch — no SDK dependency. Default model is the cheap tier;
 * the Reflexion critique step passes its own stronger model ("generate cheap, judge dear"). */
export const anthropicProvider = (config: AnthropicConfig = {}): ChatProvider => {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = config.model ?? process.env.OVERSTORY_ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  if (!apiKey) throw new ProviderError('anthropic', 'ANTHROPIC_API_KEY is not set');
  return {
    name: `anthropic:${model}`,
    concurrency: config.concurrency ?? 6,
    async chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens ?? 2000,
            ...(opts.system ? { system: opts.system } : {}),
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } catch (cause) {
        throw new ProviderError(`anthropic:${model}`, 'request failed', cause);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError(`anthropic:${model}`, `HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((b) => b.type === 'text')?.text;
      if (typeof text !== 'string') throw new ProviderError(`anthropic:${model}`, 'empty response');
      return text;
    },
  };
};
